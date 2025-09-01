// src/services/sensorData.service.js
import { deviceService } from "./device.service.js";
import { sensorReadingModel } from "../models/sensorReading.model.js";
import { latestReadingModel } from "../models/latestReading.model.js";
import { notificationService } from "./notification.service.js";
import { deviceStatusService } from "./deviceStatus.service.js";
import { alertModel } from "../models/alert.model.js"; // <-- IMPORT BARU
import { io } from "../app.js";
import {
  ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD,
  ABSOLUTE_WATER_LEVEL_ALERT_THRESHOLD_CM,
  RAINFALL_THRESHOLD_NO_RAIN_MAX,
  RAINFALL_THRESHOLD_LIGHT_RAIN_MAX,
  RAINFALL_THRESHOLD_MODERATE_RAIN_MAX,
  RAPID_RISE_THRESHOLD_CM_PER_MINUTE,
  PH_CRITICAL_LOW,
  PH_POOR_LOW,
  PH_GOOD_LOW,
  PH_GOOD_HIGH,
  PH_POOR_HIGH,
  PH_CRITICAL_HIGH,
  TURBIDITY_GOOD_MAX,
  TURBIDITY_MODERATE_MAX,
  TURBIDITY_POOR_MAX,
} from "../config/server.config.js";

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

function getWaterQualityCategory(ph, turbidity) {
  if (
    ph === null ||
    ph === undefined ||
    isNaN(ph) ||
    turbidity === null ||
    turbidity === undefined ||
    isNaN(turbidity)
  ) {
    return "Data Tidak Lengkap";
  }
  let phCategory = "Tidak Diketahui";
  let turbidityCategory = "Tidak Diketahui";
  if (ph < PH_CRITICAL_LOW || ph > PH_CRITICAL_HIGH) phCategory = "Kritis";
  else if (ph < PH_POOR_LOW || ph > PH_POOR_HIGH) phCategory = "Buruk";
  else if (ph >= PH_GOOD_LOW && ph <= PH_GOOD_HIGH) phCategory = "Baik";
  else phCategory = "Sedang";
  if (turbidity <= TURBIDITY_GOOD_MAX) turbidityCategory = "Baik";
  else if (turbidity <= TURBIDITY_MODERATE_MAX) turbidityCategory = "Sedang";
  else if (turbidity <= TURBIDITY_POOR_MAX) turbidityCategory = "Buruk";
  else turbidityCategory = "Kritis";
  if (phCategory === "Kritis" || turbidityCategory === "Kritis")
    return "Kritis";
  if (phCategory === "Buruk" || turbidityCategory === "Buruk") return "Buruk";
  if (phCategory === "Baik" && turbidityCategory === "Baik") return "Baik";
  return "Sedang";
}

export const sensorDataService = {
  async submitSensorData(rawData) {
    const {
      deviceId,
      deviceTimestamp,
      waterLevel_cm: rawDistanceValueFromPayload,
      tds_ppm,
      turbidity_ntu,
      ph_value,
      temperature_c,
      rainfall_value_raw,
    } = rawData;

    if (!deviceId || typeof deviceId !== "string") {
      throw new AppError("deviceId is required and must be a string.", 400);
    }

    let deviceConfig = await deviceService.getDeviceById(deviceId);
    if (!deviceConfig) {
      console.warn(
        `[Sensor Service] Device config for ${deviceId} not found. Attempting auto-registration.`
      );
      deviceConfig = await deviceService.ensureDeviceExists({ deviceId });
      if (!deviceConfig) {
        deviceConfig = await deviceService.getDeviceById(deviceId);
      }
      if (!deviceConfig) {
        throw new AppError(
          `Konfigurasi untuk perangkat ID ${deviceId} tidak ditemukan.`,
          404
        );
      }
    }

    const readingTimestamp = deviceTimestamp
      ? new Date(deviceTimestamp)
      : new Date();
    if (isNaN(readingTimestamp.getTime())) {
      throw new AppError("Invalid deviceTimestamp format.", 400);
    }

    let calculatedWaterLevelCm = null;
    const parsedRawDistanceCm =
      rawDistanceValueFromPayload !== undefined &&
      rawDistanceValueFromPayload !== null
        ? parseFloat(String(rawDistanceValueFromPayload))
        : null;

    if (parsedRawDistanceCm !== null && !isNaN(parsedRawDistanceCm)) {
      if (
        deviceConfig.sensor_height_cm !== null &&
        deviceConfig.sensor_height_cm !== undefined
      ) {
        const sensorHeight = Number(deviceConfig.sensor_height_cm);
        if (!isNaN(sensorHeight)) {
          calculatedWaterLevelCm = sensorHeight - parsedRawDistanceCm;
          if (calculatedWaterLevelCm < 0) {
            calculatedWaterLevelCm = 0;
          }
        } else {
          console.warn(
            `[Sensor Service] sensor_height_cm for ${deviceId} is not a valid number: ${deviceConfig.sensor_height_cm}.`
          );
        }
      } else {
        console.warn(
          `[Sensor Service] sensor_height_cm not configured for ${deviceId}.`
        );
      }
    } else {
      console.warn(
        `[Sensor Service] No valid raw distance (from payload's waterLevel_cm) for ${deviceId}.`
      );
    }

    const parsedRainfallRaw =
      rainfall_value_raw !== undefined && rainfall_value_raw !== null
        ? parseInt(String(rainfall_value_raw), 10)
        : null;
    // (Validasi lain jika perlu)

    const readingToStore = {
      device_id: deviceId,
      timestamp: readingTimestamp,
      water_level_cm:
        calculatedWaterLevelCm !== null && !isNaN(calculatedWaterLevelCm)
          ? calculatedWaterLevelCm
          : null,
      raw_distance_cm:
        parsedRawDistanceCm !== null && !isNaN(parsedRawDistanceCm)
          ? parsedRawDistanceCm
          : null,
      tds_ppm:
        tds_ppm !== undefined && tds_ppm !== null ? Number(tds_ppm) : null,
      turbidity_ntu:
        turbidity_ntu !== undefined && turbidity_ntu !== null
          ? Number(turbidity_ntu)
          : null,
      ph_value:
        ph_value !== undefined && ph_value !== null ? Number(ph_value) : null,
      temperature_c:
        temperature_c !== undefined && temperature_c !== null
          ? Number(temperature_c)
          : null,
      rainfall_value_raw:
        parsedRainfallRaw !== null && !isNaN(parsedRainfallRaw)
          ? parsedRainfallRaw
          : null,
    };

    await sensorReadingModel.create(readingToStore);
    const latestReading = await latestReadingModel.upsert(readingToStore);
    // console.log("[Sensor Service] Data terbaru di-upsert:", latestReading.device_id);

    let alertInfo = { triggered: false, message: "", payload: null };

    if (latestReading) {
      io.emit("new_sensor_data", latestReading);
      await deviceStatusService.markDeviceAsOnlineIfNeeded(
        latestReading.device_id,
        deviceConfig.location,
        latestReading.timestamp
      );

      // --- LOGIKA STATUS CURAH HUJAN (TETAP SAMA, HANYA EMIT UPDATE BIASA) ---
      const currentRainfallRawVal =
        latestReading.rainfall_value_raw !== null
          ? Number(latestReading.rainfall_value_raw)
          : null;
      if (currentRainfallRawVal !== null && !isNaN(currentRainfallRawVal)) {
        let rainfallCategory = "Tidak Hujan";
        if (currentRainfallRawVal <= RAINFALL_THRESHOLD_NO_RAIN_MAX)
          rainfallCategory = "Tidak Hujan";
        else if (currentRainfallRawVal <= RAINFALL_THRESHOLD_LIGHT_RAIN_MAX)
          rainfallCategory = "Hujan Ringan";
        else if (currentRainfallRawVal <= RAINFALL_THRESHOLD_MODERATE_RAIN_MAX)
          rainfallCategory = "Hujan Sedang";
        else rainfallCategory = "Hujan Lebat";
        io.emit("rainfall_update", {
          deviceId,
          rainfall_raw_value: currentRainfallRawVal,
          rainfall_category: rainfallCategory,
          timestamp: latestReading.timestamp,
        });
      }

      // --- LOGIKA PERINGATAN BANJIR ---
      const floodAlertType = "flood";
      let isFloodConditionMet = false;
      let floodAlertMessage = "";
      let floodSeverity = "warning"; // Default
      let floodTriggeringData = {};
      let floodCriticalLevel = null;
      let floodAlertTypeTriggered = "";

      const currentWaterLevelForAlert =
        latestReading.water_level_cm !== null
          ? Number(latestReading.water_level_cm)
          : null;

      if (
        currentWaterLevelForAlert !== null &&
        !isNaN(currentWaterLevelForAlert)
      ) {
        const sensorHeightCm =
          deviceConfig.sensor_height_cm !== null
            ? Number(deviceConfig.sensor_height_cm)
            : null;
        const devAbsThr =
          deviceConfig.alert_threshold_absolute_cm !== null
            ? Number(deviceConfig.alert_threshold_absolute_cm)
            : null;
        const devPercThr =
          deviceConfig.alert_threshold_percentage !== null
            ? Number(deviceConfig.alert_threshold_percentage)
            : null;

        // Prioritas: Device Percentage -> Device Absolute -> Global Percentage -> Global Absolute
        if (
          devPercThr !== null &&
          sensorHeightCm !== null &&
          sensorHeightCm > 0 &&
          devPercThr > 0 &&
          devPercThr <= 1
        ) {
          floodCriticalLevel = sensorHeightCm * devPercThr;
          if (currentWaterLevelForAlert >= floodCriticalLevel) {
            isFloodConditionMet = true;
            floodAlertTypeTriggered = "device_percentage_threshold";
            floodAlertMessage = `PERINGATAN BANJIR (DEVICE %)! ${deviceId} (${
              deviceConfig.location || "N/A"
            }): Air ${currentWaterLevelForAlert}cm >= ${
              devPercThr * 100
            }% (${floodCriticalLevel.toFixed(
              2
            )}cm) dari tinggi sensor (${sensorHeightCm}cm).`;
            floodSeverity = "critical";
          }
        } else if (devAbsThr !== null && devAbsThr > 0) {
          floodCriticalLevel = devAbsThr;
          if (currentWaterLevelForAlert >= floodCriticalLevel) {
            isFloodConditionMet = true;
            floodAlertTypeTriggered = "device_absolute_threshold";
            floodAlertMessage = `PERINGATAN BANJIR (DEVICE ABS)! ${deviceId} (${
              deviceConfig.location || "N/A"
            }): Air ${currentWaterLevelForAlert}cm >= ${floodCriticalLevel}cm.`;
            floodSeverity = "critical";
          }
        } else if (sensorHeightCm !== null && sensorHeightCm > 0) {
          // Fallback ke Global Percentage
          floodCriticalLevel =
            sensorHeightCm * ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD;
          if (currentWaterLevelForAlert >= floodCriticalLevel) {
            isFloodConditionMet = true;
            floodAlertTypeTriggered = "global_percentage_threshold";
            floodAlertMessage = `PERINGATAN BANJIR (GLOBAL %)! ${deviceId} (${
              deviceConfig.location || "N/A"
            }): Air ${currentWaterLevelForAlert}cm >= ${
              ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD * 100
            }% (${floodCriticalLevel.toFixed(
              2
            )}cm) dari tinggi sensor (${sensorHeightCm}cm).`;
            floodSeverity = "warning"; // Bisa disesuaikan
          }
        } else {
          // Fallback ke Global Absolute
          floodCriticalLevel = ABSOLUTE_WATER_LEVEL_ALERT_THRESHOLD_CM;
          if (currentWaterLevelForAlert >= floodCriticalLevel) {
            isFloodConditionMet = true;
            floodAlertTypeTriggered = "global_absolute_threshold";
            floodAlertMessage = `PERINGATAN BANJIR (GLOBAL ABS)! ${deviceId} (${
              deviceConfig.location || "N/A"
            }): Air ${currentWaterLevelForAlert}cm >= ${floodCriticalLevel}cm.`;
            floodSeverity = "warning"; // Bisa disesuaikan
          }
        }
        if (isFloodConditionMet) {
          floodTriggeringData = {
            waterLevel_cm: currentWaterLevelForAlert,
            threshold_type: floodAlertTypeTriggered,
            threshold_value: floodCriticalLevel
              ? parseFloat(floodCriticalLevel.toFixed(2))
              : null,
            sensorHeight_cm: sensorHeightCm,
            alert_threshold_percentage:
              devPercThr || ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD,
          };
        }
      }

      const activeFloodAlert = await alertModel.findActiveAlert(
        deviceId,
        floodAlertType
      );
      if (isFloodConditionMet) {
        const alertPayloadForNotification = {
          // Payload notifikasi yang kaya dari kode sebelumnya
          deviceId: deviceId,
          location: deviceConfig.location,
          waterLevel_cm: currentWaterLevelForAlert,
          sensorHeight_cm: Number(deviceConfig.sensor_height_cm), // Pastikan ini angka
          thresholdPercentage:
            floodAlertTypeTriggered.includes("percentage") && devPercThr
              ? devPercThr * 100
              : floodAlertTypeTriggered.includes("percentage")
              ? ALERT_WATER_LEVEL_PERCENTAGE_THRESHOLD * 100
              : null,
          criticalLevel_cm: floodCriticalLevel
            ? parseFloat(floodCriticalLevel.toFixed(2))
            : null,
          alertType: floodAlertTypeTriggered, // Jenis threshold spesifik
          timestamp: latestReading.timestamp,
          serverTimestamp: new Date().toISOString(),
          message: floodAlertMessage, // Pesan yang dihasilkan di atas
          title: `🚨 PERINGATAN BANJIR: ${deviceId} 🚨`,
          body: floodAlertMessage.substring(0, 200),
          icon: "/icons/icon-192x192.png", // Sesuaikan path ikon
          badge: "/icons/badge-72x72.png", // Sesuaikan path badge
          data: {
            url: `/dashboard?deviceId=${deviceId}&alert=true&alertType=${floodAlertType}`,
          },
        };

        if (!activeFloodAlert) {
          await alertModel.create({
            device_id: deviceId,
            alert_type: floodAlertType,
            message: floodAlertMessage,
            severity: floodSeverity,
            triggering_sensor_data: JSON.stringify(floodTriggeringData),
            sensor_data_timestamp: latestReading.timestamp,
          });
          console.warn(
            `[Alert Logic] Created new ${floodAlertType} alert for ${deviceId}: ${floodAlertMessage}`
          );
          io.emit("flood_alert", alertPayloadForNotification);
          notificationService
            .sendFloodAlertPushNotification(
              deviceId,
              alertPayloadForNotification
            )
            .catch(console.error);
          alertInfo = {
            triggered: true,
            message: floodAlertMessage,
            payload: alertPayloadForNotification,
          };
        } else {
          console.log(
            `[Alert Logic] ${floodAlertType} alert for ${deviceId} is still active. Current msg: "${floodAlertMessage}". DB msg: "${activeFloodAlert.message}"`
          );
          
          // ▼▼▼ PERBAIKAN DITERAPKAN DI SINI ▼▼▼
          notificationService
            .sendFloodAlertPushNotification(
              deviceId,
              alertPayloadForNotification
            )
            .catch(console.error);
          // ▲▲▲ AKHIR PERBAIKAN ▲▲▲

          alertInfo = {
            triggered: true,
            message: floodAlertMessage, // Gunakan pesan saat ini
            payload: alertPayloadForNotification, // Gunakan payload saat ini
          };
        }
      } else if (activeFloodAlert) {
        await alertModel.markAsResolved(
          activeFloodAlert.id,
          latestReading.timestamp
        );
        console.log(
          `[Alert Logic] Resolved ${floodAlertType} alert ID ${activeFloodAlert.id} for ${deviceId}`
        );
        io.emit("alert_resolved", {
          deviceId,
          alertType: floodAlertType,
          alertId: activeFloodAlert.id,
          resolved_at: latestReading.timestamp,
          message: `Peringatan banjir untuk ${deviceId} telah berakhir.`,
        });
      }

      // --- LOGIKA PENGECEKAN LAJU KENAIKAN AIR ---
      const rapidRiseAlertType = "rapid_rise";
      let isRapidRiseConditionMet = false;
      let rapidRiseMessage = "";
      let rapidRiseTriggeringData = {};
      let rapidRiseSeverity = "warning";

      if (
        latestReading.water_level_cm !== null &&
        latestReading.previous_water_level_cm !== null &&
        latestReading.timestamp &&
        latestReading.previous_timestamp
      ) {
        const currentWaterLevel = Number(latestReading.water_level_cm);
        const previousWaterLevel = Number(
          latestReading.previous_water_level_cm
        );
        if (!isNaN(currentWaterLevel) && !isNaN(previousWaterLevel)) {
          const currentTime = new Date(latestReading.timestamp).getTime();
          const previousTime = new Date(
            latestReading.previous_timestamp
          ).getTime();
          const deltaLevel = currentWaterLevel - previousWaterLevel;
          const deltaTimeSeconds = (currentTime - previousTime) / 1000;

          if (deltaTimeSeconds > 0 && deltaLevel > 0) {
            const deltaTimeMinutes = deltaTimeSeconds / 60;
            const rateOfChangeCmPerMinute = deltaLevel / deltaTimeMinutes;
            if (rateOfChangeCmPerMinute >= RAPID_RISE_THRESHOLD_CM_PER_MINUTE) {
              isRapidRiseConditionMet = true;
              rapidRiseMessage = `!!! KENAIKAN AIR CEPAT TERDETEKSI !!! Perangkat ${
                latestReading.device_id
              }: Ketinggian air naik ${deltaLevel.toFixed(
                2
              )}cm dalam ${deltaTimeSeconds.toFixed(
                2
              )} detik (laju: ${rateOfChangeCmPerMinute.toFixed(2)} cm/menit).`;
              rapidRiseSeverity = "critical"; // Kenaikan cepat dianggap kritis
              rapidRiseTriggeringData = {
                currentWaterLevel_cm: currentWaterLevel,
                previousWaterLevel_cm: previousWaterLevel,
                deltaLevel_cm: parseFloat(deltaLevel.toFixed(2)),
                deltaTime_seconds: parseFloat(deltaTimeSeconds.toFixed(2)),
                rateOfChange_cm_per_minute: parseFloat(
                  rateOfChangeCmPerMinute.toFixed(2)
                ),
              };
            }
          }
        }
      }

      const activeRapidRiseAlert = await alertModel.findActiveAlert(
        deviceId,
        rapidRiseAlertType
      );
      if (isRapidRiseConditionMet) {
        const rapidRisePayloadForNotification = {
          // Menggunakan payload detail dari kode sebelumnya
          deviceId: latestReading.device_id,
          location: deviceConfig.location,
          ...rapidRiseTriggeringData, // Sebar data pemicu
          timestamp: latestReading.timestamp,
          message: rapidRiseMessage,
          title: `🚨 KENAIKAN AIR CEPAT: ${latestReading.device_id} 🚨`,
          body: rapidRiseMessage.substring(0, 200),
          icon: "/icons/icon-rapid-rise-alert-192x192.png",
          data: {
            url: `/dashboard?deviceId=${latestReading.device_id}&alertType=${rapidRiseAlertType}`,
          },
        };
        if (!activeRapidRiseAlert) {
          await alertModel.create({
            device_id: deviceId,
            alert_type: rapidRiseAlertType,
            message: rapidRiseMessage,
            severity: rapidRiseSeverity,
            triggering_sensor_data: JSON.stringify(rapidRiseTriggeringData),
            sensor_data_timestamp: latestReading.timestamp,
          });
          console.warn(
            `[Alert Logic] Created new ${rapidRiseAlertType} alert for ${deviceId}`
          );
          io.emit("rapid_water_rise_alert", rapidRisePayloadForNotification);
          notificationService.sendFloodAlertPushNotification(deviceId, rapidRisePayloadForNotification).catch(console.error);
          if (!alertInfo.triggered || rapidRiseSeverity === "critical") {
            // Prioritaskan alertInfo jika ini kritis atau belum ada yg trigger
            alertInfo = {
              triggered: true,
              message: rapidRiseMessage,
              payload: rapidRisePayloadForNotification,
            };
          }
        } else {
          console.log(
            `[Alert Logic] ${rapidRiseAlertType} alert for ${deviceId} is still active. Current msg: "${rapidRiseMessage}". DB msg: "${activeRapidRiseAlert.message}"`
          );
          // ▼▼▼ PERBAIKAN DITERAPKAN DI SINI ▼▼▼
          notificationService.sendFloodAlertPushNotification(deviceId, rapidRisePayloadForNotification).catch(console.error);
          // ▲▲▲ AKHIR PERBAIKAN ▲▲▲
          if (!alertInfo.triggered || rapidRiseSeverity === "critical") {
            alertInfo = {
              triggered: true,
              message: rapidRiseMessage,
              payload: rapidRisePayloadForNotification,
            };
          }
        }
      } else if (activeRapidRiseAlert) {
        await alertModel.markAsResolved(
          activeRapidRiseAlert.id,
          latestReading.timestamp
        );
        console.log(
          `[Alert Logic] Resolved ${rapidRiseAlertType} alert ID ${activeRapidRiseAlert.id} for ${deviceId}`
        );
        io.emit("alert_resolved", {
          deviceId,
          alertType: rapidRiseAlertType,
          alertId: activeRapidRiseAlert.id,
          resolved_at: latestReading.timestamp,
          message: `Peringatan kenaikan air cepat untuk ${deviceId} telah berakhir.`,
        });
      }

      // --- LOGIKA STATUS KUALITAS AIR ---
      const criticalWqAlertType = "critical_water_quality";
      let isCriticalWqConditionMet = false;
      let criticalWqMessage = "";
      let criticalWqTriggeringData = {};
      let criticalWqSeverity = "warning";

      const currentPH =
        latestReading.ph_value !== null ? Number(latestReading.ph_value) : null;
      const currentTurbidity =
        latestReading.turbidity_ntu !== null
          ? Number(latestReading.turbidity_ntu)
          : null;

      // Emit update kualitas air biasa
      if (currentPH !== null && currentTurbidity !== null) {
        const waterQualityCategory = getWaterQualityCategory(
          currentPH,
          currentTurbidity
        );
        io.emit("water_quality_update", {
          deviceId: deviceId,
          ph_value: currentPH,
          turbidity_ntu: currentTurbidity,
          qualityCategory: waterQualityCategory,
          timestamp: latestReading.timestamp,
        });
        if (
          waterQualityCategory === "Kritis" ||
          waterQualityCategory === "Buruk"
        ) {
          isCriticalWqConditionMet = true;
          criticalWqMessage = `!!! PERINGATAN KUALITAS AIR (${waterQualityCategory.toUpperCase()}) !!! Perangkat ${deviceId}: pH=${currentPH}, Turbidity=${currentTurbidity} NTU.`;
          criticalWqSeverity =
            waterQualityCategory === "Kritis" ? "critical" : "warning";
          criticalWqTriggeringData = {
            ph_value: currentPH,
            turbidity_ntu: currentTurbidity,
            qualityCategory: waterQualityCategory,
          };
        }
      }

      const activeCriticalWqAlert = await alertModel.findActiveAlert(
        deviceId,
        criticalWqAlertType
      );
      if (isCriticalWqConditionMet) {
        const qualityAlertPayloadForNotification = {
          // Menggunakan payload detail dari kode sebelumnya
          deviceId: deviceId,
          location: deviceConfig.location, // Anda mungkin perlu menambahkan ini ke deviceConfig jika belum ada
          ...criticalWqTriggeringData,
          timestamp: latestReading.timestamp,
          message: criticalWqMessage,
          title: `🚨 Kualitas Air ${criticalWqTriggeringData.qualityCategory.toUpperCase()}: ${deviceId} 🚨`,
          body: `Kualitas air terdeteksi ${criticalWqTriggeringData.qualityCategory} (pH: ${currentPH}, Turb: ${currentTurbidity} NTU).`,
          icon: "/icons/icon-water-quality-alert-192x192.png",
          data: {
            url: `/dashboard?deviceId=${deviceId}&alertType=${criticalWqAlertType}`,
          },
        };
        if (!activeCriticalWqAlert) {
          await alertModel.create({
            device_id: deviceId,
            alert_type: criticalWqAlertType,
            message: criticalWqMessage,
            severity: criticalWqSeverity,
            triggering_sensor_data: JSON.stringify(criticalWqTriggeringData),
            sensor_data_timestamp: latestReading.timestamp,
          });
          console.warn(
            `[Alert Logic] Created new ${criticalWqAlertType} alert for ${deviceId}`
          );
          io.emit(
            "critical_water_quality_alert",
            qualityAlertPayloadForNotification
          );
          notificationService
            .sendFloodAlertPushNotification(
              deviceId,
              qualityAlertPayloadForNotification
            )
            .catch(console.error); // Ganti jika ada fungsi notif khusus WQ
          if (!alertInfo.triggered || criticalWqSeverity === "critical") {
            alertInfo = {
              triggered: true,
              message: criticalWqMessage,
              payload: qualityAlertPayloadForNotification,
            };
          }
        } else {
          console.log(
            `[Alert Logic] ${criticalWqAlertType} alert for ${deviceId} is still active. Current msg: "${criticalWqMessage}". DB msg: "${activeCriticalWqAlert.message}"`
          );
          // ▼▼▼ PERBAIKAN DITERAPKAN DI SINI ▼▼▼
          notificationService
            .sendFloodAlertPushNotification(
              deviceId,
              qualityAlertPayloadForNotification
            )
            .catch(console.error);
          // ▲▲▲ AKHIR PERBAIKAN ▲▲▲
          if (!alertInfo.triggered || criticalWqSeverity === "critical") {
            alertInfo = {
              triggered: true,
              message: criticalWqMessage,
              payload: qualityAlertPayloadForNotification,
            };
          }
        }
      } else if (activeCriticalWqAlert) {
        await alertModel.markAsResolved(
          activeCriticalWqAlert.id,
          latestReading.timestamp
        );
        console.log(
          `[Alert Logic] Resolved ${criticalWqAlertType} alert ID ${activeCriticalWqAlert.id} for ${deviceId}`
        );
        io.emit("alert_resolved", {
          deviceId,
          alertType: criticalWqAlertType,
          alertId: activeCriticalWqAlert.id,
          resolved_at: latestReading.timestamp,
          message: `Peringatan kualitas air untuk ${deviceId} telah berakhir.`,
        });
      }
    }
    return { latestReading, alertInfo };
  },

  async getHistoricalData(deviceId, filters = {}) {
    // Kode getHistoricalData tetap sama seperti sebelumnya
    if (!deviceId) {
      throw new AppError("Device ID is required for historical data.", 400);
    }
    const {
      limit,
      sortOrder = "ASC",
      timeRange,
      startDate: rawStartDate,
      endDate: rawEndDate,
    } = filters;
    let processedStartDate = rawStartDate;
    let processedEndDate = rawEndDate;
    if (timeRange && timeRange !== "all" && !rawStartDate && !rawEndDate) {
      const now = new Date();
      let daysToSubtract = 0;
      switch (timeRange) {
        case "7d":
          daysToSubtract = 7;
          break;
        case "30d":
          daysToSubtract = 30;
          break;
        case "90d":
          daysToSubtract = 90;
          break;
        default:
          console.warn(`[Sensor Service] Unknown timeRange: ${timeRange}.`);
          break;
      }
      if (daysToSubtract > 0) {
        const pastDate = new Date(now);
        pastDate.setDate(now.getDate() - daysToSubtract);
        pastDate.setHours(0, 0, 0, 0);
        processedStartDate = pastDate.toISOString().split("T")[0];
      }
    }
    const modelFilters = {
      limit: limit !== undefined ? Number(limit) : undefined,
      sortOrder,
      ...(processedStartDate && { startDate: processedStartDate }),
      ...(processedEndDate && { endDate: processedEndDate }),
    };
    if (limit === 0 || limit === "0") {
      delete modelFilters.limit;
    }
    // console.log(`[Sensor Service] Fetching historical data for ${deviceId} with filters:`, modelFilters);
    return await sensorReadingModel.findHistoryByDeviceId(
      deviceId,
      modelFilters
    );
  },
};