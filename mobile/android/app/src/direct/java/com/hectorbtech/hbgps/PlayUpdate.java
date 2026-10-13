package com.hectorbtech.hbgps;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** Versión de instalación directa (APK): no usa Google Play. Las actualizaciones las hace HbgpsUpdatePlugin descargando la APK. */
final class PlayUpdate {
  interface Emit { void emit(String event, JSObject data); }

  private PlayUpdate() { }

  static void check(Activity activity, PluginCall call) {
    JSObject result = new JSObject();
    result.put("available", false);
    result.put("unsupported", true);
    call.resolve(result);
  }

  static void start(Activity activity, Emit emit, boolean immediate, PluginCall call) { call.reject("PLAY_UNSUPPORTED"); }

  static void complete() { }
}
