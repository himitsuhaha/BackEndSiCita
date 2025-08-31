// src/services/deviceStatus.service.js
import { pool } from "../config/database.config.js"; // Untuk query JOIN yang lebih kompleks
import { deviceModel } from "../models/device.model.js"; // Untuk update status
import { io } from "../app.js"; // Untuk emit event Socket.IO
import { DEVICE_OFFLINE_THRESHOLD_SECONDS } from "../config/server.config.js";
import { notificationService } from "./notification.service.js"; // Untuk mengirim push notifikasi

export const deviceStatusService = {
  async checkDeviceStatuses() {
    console.log("\n--- [Device Status Service] Starting status check ---"); // Log awal yang lebih jelas
    let client; // Definisikan client di luar try untuk bisa diakses di finally jika pakai transaksi di sini
    try {
      // Kita tidak melakukan operasi tulis di sini yang memerlukan transaksi per check individual,
      // jadi pool.query langsung seharusnya aman. Jika updateOfflineStatus di model sudah aman.
      const queryText = `
        SELECT 
          d.device_id, 
          d.location,
          d.is_offline AS currently_marked_offline,
          lr.last_updated_at AS last_seen_data_at,
          lr.timestamp AS latest_reading_timestamp 
        FROM public.devices d
        LEFT JOIN public.latest_device_readings lr ON d.device_id = lr.device_id
        ORDER BY d.device_id;
      `;
      // console.log('[Device Status Service] Executing query to get devices and last seen times.');
      const result = await pool.query(queryText);
      const devicesFromDb = result.rows;

      console.log(
        `[Device Status Service] Found ${devicesFromDb.length} device(s) to check.`
      );

      if (devicesFromDb.length === 0) {
        console.log(
          "[Device Status Service] No devices found in database to check."
        );
        console.log(
          "--- [Device Status Service] Status check finished (no devices) ---\n"
        );
        return;
      }

      const now = new Date();
      const offlineThresholdMilliseconds =
        DEVICE_OFFLINE_THRESHOLD_SECONDS * 1000;

      for (const device of devicesFromDb) {
        console.log(
          `\n[Device Status Service] Checking device: ${device.device_id}`
        );
        console.log(
          `  Currently marked offline in DB (is_offline): ${device.currently_marked_offline}`
        );
        console.log(
          `  Last seen data at (latest_device_readings.last_updated_at): ${device.last_seen_data_at}`
        );
        console.log(
          `  Latest reading timestamp (latest_device_readings.timestamp): ${device.latest_reading_timestamp}`
        );

        let determinedToBeOffline = true; // Asumsikan offline jika tidak ada last_seen_data_at
        let lastSeenAt = null;
        let timeDifferenceMs = null;

        if (device.last_seen_data_at) {
          // Gunakan last_updated_at dari latest_device_readings
          lastSeenAt = new Date(device.last_seen_data_at);
          timeDifferenceMs = now.getTime() - lastSeenAt.getTime();
          console.log(`  Time now: ${now.toISOString()}`);
          console.log(`  Last seen parsed: ${lastSeenAt.toISOString()}`);
          console.log(`  Difference: ${timeDifferenceMs / 1000} seconds`);
          console.log(
            `  Offline threshold: ${DEVICE_OFFLINE_THRESHOLD_SECONDS} seconds`
          );

          if (timeDifferenceMs <= offlineThresholdMilliseconds) {
            determinedToBeOffline = false; // Masih dianggap online
          }
        } else {
          console.log(
            `  No last_seen_data_at record for ${device.device_id}. Assuming offline if not explicitly marked online.`
          );
          // Jika perangkat baru dibuat dan belum pernah mengirim data, ia akan default is_offline=false.
          // Jika currently_marked_offline adalah false, dan tidak ada last_seen_data_at,
          // kita mungkin ingin menandainya offline jika sudah melewati waktu tertentu sejak dibuat? (logika lebih kompleks)
          // Untuk sekarang, jika tidak ada last_seen_data_at, kita anggap dia offline kecuali jika baru saja dibuat dan belum melewati threshold.
          // Logika saat ini: jika last_seen_data_at null, determinedToBeOffline tetap true.
        }
        console.log(
          `  Determined to be offline based on timestamp comparison: ${determinedToBeOffline}`
        );

        // Cek apakah status berubah
        if (determinedToBeOffline && !device.currently_marked_offline) {
          // Perangkat baru saja menjadi offline
          console.warn(
            `[Device Status Service] STATUS CHANGE: Device ${
              device.device_id
            } has gone OFFLINE. Last seen: ${
              lastSeenAt
                ? lastSeenAt.toISOString()
                : "Never or not recorded in latest_readings"
            }`
          );
          await deviceModel.updateOfflineStatus(device.device_id, true);
          const offlinePayload = {
            deviceId: device.device_id,
            isOffline: true,
            location: device.location,
            lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
          };
          io.emit("device_status_update", offlinePayload);
          console.log(
            `[Device Status Service] Emitted device_status_update (OFFLINE) for ${device.device_id}`
          );

          const offlinePushMessage = `Perangkat ${device.device_id} (${
            device.location || "N/A"
          }) terakhir terlihat pada ${
            lastSeenAt ? lastSeenAt.toLocaleString("id-ID") : "tidak diketahui"
          } dan sekarang dianggap offline.`;
          notificationService
            .sendFloodAlertPushNotification(device.device_id, {
              title: `⚠️ Perangkat Offline: ${device.device_id}`,
              body: offlinePushMessage,
              message: offlinePushMessage, // <-- TAMBAHKAN INI
              icon: "/icons/offline.webp",
              data: {
                url: `/admin/devices/edit/${device.device_id}?status=offline`,
              },
            })
            .catch((err) =>
              console.error(
                `[Device Status] Error sending OFFLINE push for ${device.device_id}:`,
                err
              )
            );
        } else if (!determinedToBeOffline && device.currently_marked_offline) {
          // Perangkat kembali online
          console.log(
            `[Device Status Service] STATUS CHANGE: Device ${
              device.device_id
            } is BACK ONLINE. Last seen: ${
              lastSeenAt ? lastSeenAt.toISOString() : "N/A"
            }`
          );
          await deviceModel.updateOfflineStatus(device.device_id, false);
          const onlinePayload = {
            deviceId: device.device_id,
            isOffline: false,
            location: device.location,
            lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
          };
          io.emit("device_status_update", onlinePayload);
          console.log(
            `[Device Status Service] Emitted device_status_update (ONLINE) for ${device.device_id}`
          );

          const onlinePushMessage = `Perangkat ${device.device_id} (${
            device.location || "N/A"
          }) telah kembali online pada ${
            lastSeenAt ? lastSeenAt.toLocaleString("id-ID") : "sekarang"
          }.`;
          notificationService
            .sendFloodAlertPushNotification(device.device_id, {
              title: `✅ Perangkat Online: ${device.device_id}`,
              body: onlinePushMessage,
              message: onlinePushMessage, // <-- TAMBAHKAN INI
              icon: "/icons/online.webp",
              data: {
                url: `/admin/devices/edit/${device.device_id}?status=online`,
              },
            })
            .catch((err) =>
              console.error(
                `[Device Status] Error sending ONLINE push for ${device.device_id}:`,
                err
              )
            );
        } else {
          console.log(
            `[Device Status Service] Device ${device.device_id}: No status change. Currently offline: ${device.currently_marked_offline}, Determined to be offline: ${determinedToBeOffline}`
          );
        }
      }
    } catch (error) {
      console.error(
        "[Device Status Service] Error in checkDeviceStatuses:",
        error
      );
    }
    console.log("--- [Device Status Service] Status check finished ---\n");
  },

  // ... fungsi markDeviceAsOnlineIfNeeded tetap sama ...
  async markDeviceAsOnlineIfNeeded(
    deviceId,
    deviceLocationForLog,
    lastDataTimestamp
  ) {
    // Ubah nama parameter agar jelas
    const device = await deviceModel.findById(deviceId);
    if (device && device.is_offline) {
      console.log(
        `[Device Status Service] REACTIVE: Data received from ${deviceId} which was marked offline. Marking as ONLINE.`
      );
      await deviceModel.updateOfflineStatus(deviceId, false);
      const onlinePayload = {
        deviceId: deviceId,
        isOffline: false,
        location: deviceLocationForLog || device.location, // Gunakan location yang paling relevan
        lastSeenAt: lastDataTimestamp
          ? new Date(lastDataTimestamp).toISOString()
          : new Date().toISOString(),
      };
      io.emit("device_status_update", onlinePayload);
      console.log(
        `[Device Status Service] Emitted device_status_update (REACTIVE ONLINE) for ${deviceId}`
      );

      const reactiveOnlinePushMessage = `Perangkat ${deviceId} (${
        deviceLocationForLog || device.location || "N/A"
      }) kembali online setelah mengirim data baru.`;
      notificationService
        .sendFloodAlertPushNotification(deviceId, {
          title: `✅ Perangkat Online: ${deviceId}`,
          body: reactiveOnlinePushMessage,
          message: reactiveOnlinePushMessage, // <-- TAMBAHKAN INI
          icon: "/icons/online.webp",
          data: { url: `/admin/devices/edit/${deviceId}?status=online` },
        })
        .catch((err) =>
          console.error(
            `[Device Status] Error sending reactive ONLINE push for ${deviceId}:`,
            err
          )
        );
    }
  },
};
