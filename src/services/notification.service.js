// src/services/notification.service.js
import webpush from "web-push";
import { pool } from "../config/database.config.js";
import { pushSubscriptionModel } from "../models/pushSubscription.model.js";
import { notificationPreferenceModel } from "../models/notificationPreference.model.js";

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notificationService = {
  /**
   * PERUBAHAN: Fungsi ini sekarang bisa menangani langganan dari Web dan Mobile (Android).
   * @param {Object} subscriptionPayload - Objek langganan dari klien.
   * @returns {Promise<Object>} Objek langganan yang disimpan.
   */
  async subscribeToPush(subscriptionPayload) {
    // Cek apakah ini langganan dari Android (hanya berisi fcmToken)
    if (subscriptionPayload.fcmToken && !subscriptionPayload.endpoint) {
      console.log("[Notification Service] Menerima permintaan langganan dari perangkat mobile.");
      const fcmToken = subscriptionPayload.fcmToken;

      // Kita "memalsukan" objek langganan agar sesuai dengan skema database yang ada.
      // Endpoint dibuat unik berdasarkan token itu sendiri.
      const pseudoSubscriptionObject = {
        endpoint: `FCM_TOKEN_ENDPOINT_V1::${fcmToken}`, // Ini hanya sebagai ID unik di DB
        keys: {
          p256dh: "mobile_device_key", // Nilai placeholder
          auth: "mobile_device_auth", // Nilai placeholder
        },
        fcmToken: fcmToken, // Simpan token asli untuk referensi
      };

      // Cek apakah "endpoint" palsu ini sudah ada
      const existingSubscription = await pushSubscriptionModel.findByEndpoint(
        pseudoSubscriptionObject.endpoint
      );
      if (existingSubscription) {
        console.log(`[Notification Service] Langganan mobile untuk token ini sudah ada (ID: ${existingSubscription.id}).`);
        return existingSubscription;
      }

      // Simpan objek langganan palsu ini ke database
      const newSubscription = await pushSubscriptionModel.create(pseudoSubscriptionObject);
      console.log(`[Notification Service] Langganan mobile baru dibuat dengan ID: ${newSubscription.id}`);
      return newSubscription;

    }
    // Jika bukan dari Android, jalankan logika lama untuk notifikasi web
    else if (subscriptionPayload.endpoint) {
      console.log("[Notification Service] Menerima permintaan langganan dari browser web.");
      const { endpoint, keys } = subscriptionPayload;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new AppError("Invalid web push subscription object provided.", 400);
      }

      const existingSubscription = await pushSubscriptionModel.findByEndpoint(endpoint);
      if (existingSubscription) {
        console.log(`[Notification Service] Langganan web untuk endpoint ini sudah ada (ID: ${existingSubscription.id}).`);
        return existingSubscription;
      }
      
      const newSubscription = await pushSubscriptionModel.create(subscriptionPayload);
      console.log(`[Notification Service] Langganan web baru dibuat dengan ID: ${newSubscription.id}`);
      return newSubscription;
    }
    // Jika format tidak dikenali
    else {
      throw new AppError("Invalid or unrecognized subscription payload.", 400);
    }
  },

  /**
   * Mengambil preferensi notifikasi perangkat untuk suatu langganan push.
   * @param {string} subscriptionEndpoint - URL endpoint unik dari PushSubscription.
   * @returns {Promise<Array<string>>} Array device_id yang menjadi preferensi.
   */
  async getNotificationPreferences(subscriptionEndpoint) {
    if (!subscriptionEndpoint || typeof subscriptionEndpoint !== "string") {
      throw new AppError("Subscription endpoint is required.", 400);
    }

    const subscription = await pushSubscriptionModel.findByEndpoint(
      subscriptionEndpoint
    );
    if (!subscription) {
      console.log(
        `[Notification Service] No subscription found for endpoint ${subscriptionEndpoint} when fetching preferences.`
      );
      return [];
    }

    return await notificationPreferenceModel.findBySubscriptionId(
      subscription.id
    );
  },

  /**
   * Memperbarui preferensi notifikasi perangkat untuk suatu langganan push.
   * @param {string} subscriptionEndpoint - URL endpoint unik dari PushSubscription.
   * @param {Array<string>} deviceIds - Array device_id yang dipilih.
   * @returns {Promise<void>}
   */
  async updateNotificationPreferences(subscriptionEndpoint, deviceIds) {
    if (!subscriptionEndpoint || typeof subscriptionEndpoint !== "string") {
      throw new AppError("Subscription endpoint is required.", 400);
    }
    if (!Array.isArray(deviceIds)) {
      throw new AppError("deviceIds must be an array.", 400);
    }
    for (const id of deviceIds) {
      if (typeof id !== "string") {
        throw new AppError("All deviceIds in the array must be strings.", 400);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const subscription = await pushSubscriptionModel.findByEndpoint(
        subscriptionEndpoint
      );
      if (!subscription) {
        throw new AppError(
          "Push subscription not found for the given endpoint.",
          404
        );
      }
      const pushSubscriptionDbId = subscription.id;

      await notificationPreferenceModel.deleteBySubscriptionId(
        pushSubscriptionDbId,
        client
      );
      console.log(
        `[Notification Service] Old preferences deleted for push_subscription_id: ${pushSubscriptionDbId}`
      );

      if (deviceIds.length > 0) {
        await notificationPreferenceModel.createMany(
          pushSubscriptionDbId,
          deviceIds,
          client
        );
        console.log(
          `[Notification Service] New preferences inserted for ${pushSubscriptionDbId} for devices: ${deviceIds.join(
            ", "
          )}`
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "[Notification Service] Error updating notification preferences:",
        error
      );
      if (error instanceof AppError) throw error;
      throw new AppError("Failed to update notification preferences.", 500);
    } finally {
      client.release();
    }
  },

  /**
   * Mengirim notifikasi Web Push terkait peringatan banjir.
   * @param {string} triggeringDeviceId - ID perangkat yang memicu alert.
   * @param {Object} alertFullPayload - Objek berisi detail alert untuk payload notifikasi.
   */
  async sendFloodAlertPushNotification(triggeringDeviceId, alertFullPayload) {
    if (!triggeringDeviceId || !alertFullPayload || !alertFullPayload.message) {
      console.error(
        "[Notification Service] Invalid parameters for sending push notification."
      );
      return;
    }
    console.log(
      `[Notification Service] Attempting to send push for alert on device: ${triggeringDeviceId}`
    );

    try {
      const relevantSubscriptions =
        await pushSubscriptionModel.findAllSubscribersForDevice(
          triggeringDeviceId
        );

      if (relevantSubscriptions.length > 0) {
        console.log(
          `[Notification Service] Found ${relevantSubscriptions.length} subscriptions for device ${triggeringDeviceId}.`
        );

        const notificationPushPayload = JSON.stringify({
          title:
            alertFullPayload.title ||
            `🚨 PERINGATAN BANJIR: ${triggeringDeviceId} 🚨`,
          body:
            alertFullPayload.body || alertFullPayload.message.substring(0, 200),
          icon: alertFullPayload.icon || "/icons/icon-192x192.png",
          badge: alertFullPayload.badge || "/icons/badge-72x72.png",
          data: alertFullPayload.data || {
            url: `/dashboard?deviceId=${triggeringDeviceId}&alert=true`,
          },
        });

        const sendPromises = relevantSubscriptions.map((row) => {
          const subscriptionObject = row.subscription_object;
          const subscriptionDbId = row.push_subscription_db_id;

          return webpush
            .sendNotification(subscriptionObject, notificationPushPayload)
            .then((sendResult) => {
              console.log(
                `[Notification Service] Push sent to ID ${subscriptionDbId} for ${triggeringDeviceId}. Status: ${sendResult.statusCode}`
              );
            })
            .catch((err) => {
              console.error(
                `[Notification Service] Error sending push to ID ${subscriptionDbId} (${triggeringDeviceId}): ${
                  err.statusCode
                } - ${err.body || err.message}`
              );
              if (err.statusCode === 404 || err.statusCode === 410) {
                console.log(
                  `[Notification Service] Subscription ID ${subscriptionDbId} is invalid. Deleting.`
                );
                return pushSubscriptionModel
                  .deleteById(subscriptionDbId)
                  .then((deleted) => {
                    if (deleted)
                      console.log(
                        `[Notification Service] Deleted invalid subscription ID ${subscriptionDbId}`
                      );
                    else
                      console.warn(
                        `[Notification Service] Failed to confirm deletion of invalid subscription ID ${subscriptionDbId}`
                      );
                  })
                  .catch((deleteErr) =>
                    console.error(
                      `[Notification Service] Error deleting subscription ID ${subscriptionDbId}:`,
                      deleteErr
                    )
                  );
              }
            });
        });

        await Promise.allSettled(sendPromises);
        console.log(
          `[Notification Service] All push notification attempts processed for ${triggeringDeviceId}.`
        );
      } else {
        console.log(
          `[Notification Service] No active push subscriptions prefer device ${triggeringDeviceId}.`
        );
      }
    } catch (error) {
      console.error(
        `[Notification Service] General error sending push notifications for ${triggeringDeviceId}:`,
        error
      );
    }
  },
};