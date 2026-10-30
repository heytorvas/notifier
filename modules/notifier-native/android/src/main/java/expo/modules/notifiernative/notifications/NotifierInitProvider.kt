package expo.modules.notifiernative.notifications

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import expo.modules.notifiernative.data.NotifierStore

class NotifierInitProvider : ContentProvider() {
  override fun onCreate(): Boolean {
    val appContext = context?.applicationContext ?: return false
    if (FirebaseApp.getApps(appContext).isNotEmpty()) return true
    val config = NotifierStore(appContext).firebaseConfig() ?: return true
    FirebaseApp.initializeApp(
      appContext,
      FirebaseOptions.Builder()
        .setApplicationId(config.applicationId)
        .setApiKey(config.apiKey)
        .setProjectId(config.projectId)
        .setGcmSenderId(config.senderId)
        .build(),
    )
    return true
  }

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0
}
