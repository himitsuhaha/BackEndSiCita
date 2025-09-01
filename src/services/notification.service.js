// src/services/notification.service.js
import webpush from "web-push";
import { pool } from "../config/database.config.js"; // Impor pool untuk transaksi manual
import { pushSubscriptionModel } from "../models/pushSubscription.model.js";
import { notificationPreferenceModel } from "../models/notificationPreference.model.js";

// Helper Error (jika belum ada di file util terpisah)
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notificationService = {
  /**
   * Menyimpan langganan push baru.
   * @param {Object} subscriptionObject - Objek PushSubscription dari browser atau objek {fcmToken: "..."} dari mobile.
   * @returns {Promise<Object>} Objek langganan yang disimpan.
   */
  async subscribeToPush(subscriptionObject) {
    // ▼▼▼ PERBAIKAN DI SINI ▼▼▼
    let finalSubscriptionObject = { ...subscriptionObject };

    // Handle mobile FCM token by converting it to a Web Push subscription object
    if (finalSubscriptionObject.fcmToken && !finalSubscriptionObject.endpoint) {
      console.log(`[Notification Service] Received FCM token. Converting to Web Push format.`);
      finalSubscriptionObject = {
        endpoint: `https://fcm.googleapis.com/fcm/send/${finalSubscriptionObject.fcmToken}`,
        // web-push library requires a keys object, even if empty for VAPID with FCM
        keys: {},
      };
    }

    if (!finalSubscriptionObject || !finalSubscriptionObject.endpoint) {
      throw new AppError("Invalid subscription object or FCM token provided.", 400);
    }
    // ▲▲▲ AKHIR PERBAIKAN ▲▲▲

    // Cek apakah langganan dengan endpoint yang sama sudah ada
    const existingSubscription = await pushSubscriptionModel.findByEndpoint(
      finalSubscriptionObject.endpoint
    );
    if (existingSubscription) {
      console.log(
        `[Notification Service] Subscription with endpoint ${finalSubscriptionObject.endpoint} already exists (ID: ${existingSubscription.id}). Returning existing.`
      );
      return existingSubscription;
    }

    // Jika belum ada, buat yang baru
    const newSubscription = await pushSubscriptionModel.create(
      finalSubscriptionObject
    );
    console.log(
      `[Notification Service] New push subscription created with ID: ${newSubscription.id}`
    );
    return newSubscription;
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
   * @param {Object} params - Objek berisi { subscriptionEndpoint?, fcmToken?, deviceIds }
   * @returns {Promise<void>}
   */
  async updateNotificationPreferences(params) {
    // ▼▼▼ PERBAIKAN DI SINI ▼▼▼
    const { subscriptionEndpoint, fcmToken, deviceIds } = params;
    
    let endpointToUse = subscriptionEndpoint;
    if (fcmToken && !endpointToUse) {
      endpointToUse = `https://fcm.googleapis.com/fcm/send/${fcmToken}`;
    }

    if (!endpointToUse || typeof endpointToUse !== 'string') {
        throw new AppError("Subscription endpoint or FCM token is required.", 400);
    }
    // ▲▲▲ AKHIR PERBAIKAN ▲▲▲

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
      
      // Gunakan endpointToUse yang sudah ditentukan
      const subscription = await pushSubscriptionModel.findByEndpoint(
        endpointToUse
      );
      if (!subscription) {
        throw new AppError(
          "Push subscription not found for the given endpoint/token.",
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
      } else {
        console.log(
          `[Notification Service] No new device preferences to insert for ${pushSubscriptionDbId}.`
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

        // Payload ini akan dikirim sebagai "data" payload ke FCM
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