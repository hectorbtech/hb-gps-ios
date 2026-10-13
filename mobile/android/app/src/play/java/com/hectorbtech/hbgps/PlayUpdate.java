package com.hectorbtech.hbgps;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Versión para Google Play: las actualizaciones las hace Google Play (API de actualizaciones dentro de la app).
 * «Inmediata» bloquea la app hasta actualizar (para versiones obligatorias); «flexible» descarga en segundo plano y pide reiniciar.
 * Google Play no permite que una app descargue e instale APK por su cuenta, por eso esta versión no usa ese método.
 */
final class PlayUpdate {
  interface Emit { void emit(String event, JSObject data); }

  private static final int REQUEST_CODE = 4711;
  private static AppUpdateManager manager;
  private static InstallStateUpdatedListener listener;

  private PlayUpdate() { }

  private static AppUpdateManager manager(Activity activity) {
    if (manager == null) manager = AppUpdateManagerFactory.create(activity.getApplicationContext());
    return manager;
  }

  static void check(Activity activity, PluginCall call) {
    manager(activity).getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        int availability = info.updateAvailability();
        JSObject result = new JSObject();
        result.put("available", availability == UpdateAvailability.UPDATE_AVAILABLE || availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS);
        result.put("versionCode", info.availableVersionCode());
        result.put("priority", info.updatePriority());
        result.put("immediate", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        result.put("flexible", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        result.put("downloaded", info.installStatus() == InstallStatus.DOWNLOADED);
        call.resolve(result);
      })
      .addOnFailureListener(error -> call.reject("PLAY_CHECK_FAILED"));
  }

  static void start(Activity activity, Emit emit, boolean immediate, PluginCall call) {
    final AppUpdateManager m = manager(activity);
    m.getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        final int type = immediate ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        if (!info.isUpdateTypeAllowed(type)) { call.reject("PLAY_TYPE_NOT_ALLOWED"); return; }
        if (!immediate) {
          if (listener != null) m.unregisterListener(listener);
          listener = state -> {
            JSObject event = new JSObject();
            event.put("status", state.installStatus());
            if (state.totalBytesToDownload() > 0) event.put("percent", (int) (state.bytesDownloaded() * 100 / state.totalBytesToDownload()));
            event.put("downloaded", state.installStatus() == InstallStatus.DOWNLOADED);
            emit.emit("playProgress", event);
          };
          m.registerListener(listener);
        }
        try {
          m.startUpdateFlowForResult(info, activity, AppUpdateOptions.newBuilder(type).build(), REQUEST_CODE);
          call.resolve();
        } catch (Exception error) {
          call.reject("PLAY_START_FAILED");
        }
      })
      .addOnFailureListener(error -> call.reject("PLAY_START_FAILED"));
  }

  /** Reinicia la app con la versión flexible ya descargada. */
  static void complete() {
    if (manager != null) manager.completeUpdate();
  }
}
