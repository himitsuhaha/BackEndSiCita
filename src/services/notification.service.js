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
   * @param {Object} subscriptionObject - Objek PushSubscription dari browser.
   * @returns {Promise<Object>} Objek langganan yang disimpan.
   */
  async subscribeToPush(subscriptionObject) {
    if (
      !subscriptionObject ||
      !subscriptionObject.endpoint ||
      !subscriptionObject.keys?.p256dh ||
      !subscriptionObject.keys?.auth
    ) {
      throw new AppError("Invalid subscription object provided.", 400);
    }

    // Cek apakah langganan dengan endpoint yang sama sudah ada
    const existingSubscription = await pushSubscriptionModel.findByEndpoint(
      subscriptionObject.endpoint
    );
    if (existingSubscription) {
      console.log(
        `[Notification Service] Subscription with endpoint ${subscriptionObject.endpoint} already exists (ID: ${existingSubscription.id}). Returning existing.`
      );
      // Anda bisa memilih untuk mengembalikan yang sudah ada atau menganggapnya sebagai sukses
      // Untuk saat ini, kita kembalikan yang sudah ada
      return existingSubscription;
    }

    // Jika belum ada, buat yang baru
    const newSubscription = await pushSubscriptionModel.create(
      subscriptionObject
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
      // Jika langganan tidak ditemukan, berarti belum ada preferensi.
      console.log(
        `[Notification Service] No subscription found for endpoint ${subscriptionEndpoint} when fetching preferences.`
      );
      return []; // Kembalikan array kosong
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
    // Validasi isi deviceIds (semua harus string)
    for (const id of deviceIds) {
      if (typeof id !== "string") {
        throw new AppError("All deviceIds in the array must be strings.", 400);
      }
    }

    const client = await pool.connect(); // Dapatkan klien untuk transaksi
    try {
      await client.query("BEGIN");

      const subscription = await pushSubscriptionModel.findByEndpoint(
        subscriptionEndpoint
      ); // Gunakan findByEndpoint dari model
      if (!subscription) {
        await client.query("ROLLBACK"); // Tidak perlu, findByEndpoint bukan bagian transaksi ini
        throw new AppError(
          "Push subscription not found for the given endpoint.",
          404
        );
      }
      const pushSubscriptionDbId = subscription.id;

      // Hapus preferensi lama menggunakan model, dengan passing client
      await notificationPreferenceModel.deleteBySubscriptionId(
        pushSubscriptionDbId,
        client
      );
      console.log(
        `[Notification Service] Old preferences deleted for push_subscription_id: ${pushSubscriptionDbId}`
      );

      // Masukkan preferensi baru jika ada, menggunakan model, dengan passing client
      // Model createMany akan melakukan loop INSERT atau bulk insert
      // Model juga bisa melakukan validasi deviceId terhadap tabel devices jika diimplementasikan
      if (deviceIds.length > 0) {
        // Di sini, kita bisa tambahkan validasi apakah semua deviceId ada di tabel devices
        // sebelum memanggil createMany. Untuk sekarang, kita asumsikan valid.
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
      // Lemparkan error asli atau error kustom
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
      // Gunakan model untuk mengambil subscriber yang relevan
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
          const subscriptionObject = row.subscription_object; // Model mengembalikan objek langganan penuh
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
                // Hapus langganan yang tidak valid menggunakan model
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
