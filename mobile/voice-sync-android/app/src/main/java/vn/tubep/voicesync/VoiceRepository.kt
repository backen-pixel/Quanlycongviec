package vn.tubep.voicesync

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

object VoiceRepository {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("voice_sync", Context.MODE_PRIVATE)

    fun baseUrl(ctx: Context) = prefs(ctx).getString("base_url", "").orEmpty().trim().trimEnd('/')

    fun authHeaders(ctx: Context): Headers = Headers.Builder()
        .add("Authorization", "Bearer ${prefs(ctx).getString("token", "")}")
        .build()

    suspend fun login(ctx: Context, base: String, email: String, pass: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().put("email", email).put("password", pass).toString()
                .toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
            val req = Request.Builder().url("$base/api/auth/login").post(body).build()
            val res = client.newCall(req).execute()
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) return@withContext Result.failure(IllegalStateException("HTTP ${res.code}: $text"))
            val json = JSONObject(text)
            val token = json.optString("token", "")
            if (token.isEmpty()) return@withContext Result.failure(IllegalStateException("Không có token"))
            prefs(ctx).edit()
                .putString("base_url", base.trim().trimEnd('/'))
                .putString("email", email)
                .putString("password", pass)
                .putString("token", token)
                .apply()
            Result.success(Unit)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    suspend fun listRecordingsJson(ctx: Context): Result<String> = withContext(Dispatchers.IO) {
        try {
            val base = baseUrl(ctx)
            val req = Request.Builder()
                .url("$base/api/voice-recordings")
                .headers(authHeaders(ctx))
                .get()
                .build()
            val res = client.newCall(req).execute()
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) return@withContext Result.failure(IllegalStateException("HTTP ${res.code}: $text"))
            Result.success(text)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    suspend fun deleteRecording(ctx: Context, id: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val base = baseUrl(ctx)
            val req = Request.Builder()
                .url("$base/api/voice-recordings/$id")
                .headers(authHeaders(ctx))
                .delete()
                .build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@withContext Result.failure(IllegalStateException("HTTP ${res.code}"))
            Result.success(Unit)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    suspend fun uploadAudioFile(
        ctx: Context,
        file: File,
        mime: String,
        originalName: String,
        phoneNumber: String?,
        direction: String?,
        callStartedMs: Long?,
        callEndedMs: Long?,
        externalCallId: String?,
        source: String,
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val base = baseUrl(ctx)
            val body = file.asRequestBody(mime.toMediaTypeOrNull())
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("source", source)
                .addFormDataPart("device_label", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                .addFormDataPart("audio", originalName, body)
            phoneNumber?.let { multipart.addFormDataPart("phone_number", it) }
            direction?.let { multipart.addFormDataPart("direction", it) }
            callStartedMs?.let { multipart.addFormDataPart("call_started_at", msToIso(it)) }
            callEndedMs?.let { multipart.addFormDataPart("call_ended_at", msToIso(it)) }
            externalCallId?.let { multipart.addFormDataPart("external_call_id", it) }

            val req = Request.Builder()
                .url("$base/api/voice-recordings")
                .headers(authHeaders(ctx))
                .post(multipart.build())
                .build()
            val res = client.newCall(req).execute()
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) return@withContext Result.failure(IllegalStateException("HTTP ${res.code}: $text"))
            Result.success(text)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    private fun msToIso(ms: Long): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date(ms))
    }
}
