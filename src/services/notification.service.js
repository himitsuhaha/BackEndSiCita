// src/services/notification.service.js
import admin from "firebase-admin"; // <-- PERUBAHAN UTAMA: Menggunakan Firebase Admin SDK
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

// Fungsi helper untuk mengekstrak token dari URL endpoint FCM
function extractTokenFromEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return null;
    const parts = endpoint.split('/');
    return parts.pop() || null;
}


export const notificationService = {
  /**
   * Menyimpan langganan push baru.
   * @param {Object} subscriptionObject - Objek PushSubscription dari browser atau objek {fcmToken: "..."} dari mobile.
   * @returns {Promise<Object>} Objek langganan yang disimpan.
   */
  async subscribeToPush(subscriptionObject) {
    let finalSubscriptionObject = { ...subscriptionObject };

    // Handle mobile FCM token by converting it to a Web Push subscription object format for storage
    if (finalSubscriptionObject.fcmToken && !finalSubscriptionObject.endpoint) {
      console.log(`[Notification Service] Received FCM token. Converting to Web Push format for DB.`);
      finalSubscriptionObject = {
        endpoint: `https://fcm.googleapis.com/fcm/send/${finalSubscriptionObject.fcmToken}`,
        // web-push library requires a keys object, even if empty for VAPID with FCM
        keys: {},
      };
    }

    if (
      !finalSubscriptionObject ||
      !finalSubscriptionObject.endpoint 
    ) {
      throw new AppError("Invalid subscription object or FCM token provided.", 400);
    }

    // Cek apakah langganan dengan endpoint yang sama sudah ada
    const existingSubscription = await pushSubscriptionModel.findByEndpoint(
      finalSubscriptionObject.endpoint
    );
    if (existingSubscription) {
      console.log(
        `[Notification Service] Subscription with endpoint ${finalSubscriptionObject.endpoint} already exists (ID: ${existingSubscription.id}). Returning existing.`
      );
      // Anda bisa memilih untuk mengembalikan yang sudah ada atau menganggapnya sebagai sukses
      // Untuk saat ini, kita kembalikan yang sudah ada
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
   * @param {Object} params - Objek berisi { subscriptionEndpoint?, fcmToken?, deviceIds }
   * @returns {Promise<void>}
   */
  async updateNotificationPreferences(params) {
    const { subscriptionEndpoint, fcmToken, deviceIds } = params;
    
    let endpointToUse = subscriptionEndpoint;
    if (fcmToken && !endpointToUse) {
      endpointToUse = `https://fcm.googleapis.com/fcm/send/${fcmToken}`;
    }

    if (!endpointToUse || typeof endpointToUse !== 'string') {
        throw new AppError("Subscription endpoint or FCM token is required.", 400);
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
        endpointToUse
      );
      if (!subscription) {
        await client.query("ROLLBACK");
        throw new AppError(
          "Push subscription not found for the given endpoint/token.",
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
   * Mengirim notifikasi menggunakan Firebase Admin SDK.
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
      // Gunakan model untuk mengambil subscriber yang relevan (tidak ada perubahan di sini)
      const relevantSubscriptions =
        await pushSubscriptionModel.findAllSubscribersForDevice(
          triggeringDeviceId
        );

      if (relevantSubscriptions.length > 0) {
        // ▼▼▼ BAGIAN UTAMA YANG DIUBAH ▼▼▼
        
        // 1. Ekstrak FCM token dari endpoint yang tersimpan di database
        const tokens = relevantSubscriptions
            .map(sub => extractTokenFromEndpoint(sub.subscription_object.endpoint))
            .filter(token => token); // Filter token yang null atau kosong

        if (tokens.length === 0) {
            console.warn(`[Notification Service] No valid FCM tokens found for device ${triggeringDeviceId}.`);
            return;
        }

        console.log(
          `[Notification Service] Found ${tokens.length} valid FCM token(s) for device ${triggeringDeviceId}.`
        );

        // 2. Buat payload pesan sesuai format Firebase Admin SDK
        const message = {
          notification: {
            title:
              alertFullPayload.title ||
              `🚨 PERINGATAN BANJIR: ${triggeringDeviceId} 🚨`,
            body:
              alertFullPayload.body || alertFullPayload.message.substring(0, 250),
          },
          data: Object.fromEntries(
            Object.entries(alertFullPayload).map(([key, value]) => [key, String(value)])
          ),
          tokens: tokens, // Kirim ke semua token yang relevan
          android: {
              priority: 'high',
              notification: {
                  // Pastikan Channel ID ini sama persis dengan yang ada di aplikasi Android Anda
                  channel_id: 'FloodWarningChannel_v3' 
              }
          },
        };

        // 3. Kirim pesan menggunakan Firebase Admin SDK
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[Notification Service] FCM send result: ${response.successCount} success, ${response.failureCount} failure.`);

        // 4. Handle token yang sudah tidak valid (opsional tapi sangat direkomendasikan)
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                const errorCode = resp.error.code;
                console.error(`[Notification Service] Failed to send to token ${tokens[idx]}:`, errorCode);
                if (
                  errorCode === 'messaging/registration-token-not-registered' ||
                  errorCode === 'messaging/invalid-registration-token'
                ) {
                  const badToken = tokens[idx];
                  const badEndpoint = `https://fcm.googleapis.com/fcm/send/${badToken}`;
                  console.log(`[Notification Service] Deleting invalid/expired token endpoint: ${badEndpoint}`);
                  pushSubscriptionModel.findByEndpoint(badEndpoint)
                    .then(sub => {
                        if (sub) {
                           pushSubscriptionModel.deleteById(sub.id);
                        }
                    });
                }
              }
            });
        }
        
        // ▲▲▲ AKHIR BAGIAN YANG DIUBAH ▲▲▲
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