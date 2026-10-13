package com.hectorbtech.hbgps;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Actualización de la app. Android no deja que una app instale en silencio: este plugin descarga la APK nueva (con avance)
 * y abre la pantalla nativa de instalación, donde el usuario toca «Instalar» una sola vez. Android solo acepta la APK si
 * está firmada con la misma llave que la instalada, así que una APK ajena no puede reemplazar a la app.
 */
@CapacitorPlugin(name = "HbgpsUpdate")
public class HbgpsUpdatePlugin extends Plugin {
  private File downloaded;

  @PluginMethod
  public void getVersion(PluginCall call) {
    try {
      Context context = getContext();
      PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
      JSObject result = new JSObject();
      result.put("version", info.versionName == null ? "0.0.0" : info.versionName);
      result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
      call.resolve(result);
    } catch (Exception error) {
      call.reject("GET_VERSION_FAILED");
    }
  }

  /** «direct» (APK propia, se actualiza descargándola) o «play» (Google Play, se actualiza con la API de Google). */
  @PluginMethod
  public void getChannel(PluginCall call) {
    JSObject result = new JSObject();
    result.put("channel", getContext().getString(R.string.dist_channel));
    call.resolve(result);
  }

  @PluginMethod
  public void playCheck(PluginCall call) { PlayUpdate.check(getActivity(), call); }

  @PluginMethod
  public void playStart(PluginCall call) {
    PlayUpdate.start(getActivity(), (event, data) -> notifyListeners(event, data), Boolean.TRUE.equals(call.getBoolean("immediate", false)), call);
  }

  @PluginMethod
  public void playComplete(PluginCall call) { PlayUpdate.complete(); call.resolve(); }

  /** Descarga la APK de {url} (completa, con http/https) y la deja lista; emite «progress» {percent}. */
  @PluginMethod
  public void download(PluginCall call) {
    final String address = call.getString("url", "");
    if (address == null || !address.startsWith("http")) { call.reject("BAD_URL"); return; }
    new Thread(() -> {
      File target = new File(getContext().getCacheDir(), "hbgps-update.apk");
      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        if (connection.getResponseCode() != 200) throw new Exception("HTTP_" + connection.getResponseCode());
        long total = connection.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
          byte[] chunk = new byte[16384];
          int read;
          while ((read = input.read(chunk)) != -1) {
            output.write(chunk, 0, read);
            done += read;
            int percent = total > 0 ? (int) (done * 100 / total) : -1;
            if (percent != lastPercent) {
              lastPercent = percent;
              JSObject progress = new JSObject();
              progress.put("percent", percent);
              notifyListeners("progress", progress);
            }
          }
        }
        if (total > 0 && done != total) throw new Exception("INCOMPLETE");
        downloaded = target;
        resolveUi(call, null, null);
      } catch (Exception error) {
        target.delete();
        resolveUi(call, null, "DOWNLOAD_FAILED");
      } finally {
        if (connection != null) connection.disconnect();
      }
    }).start();
  }

  /** Abre el instalador de Android con la APK descargada. Si falta el permiso «instalar apps desconocidas», abre ese ajuste y avisa. */
  @PluginMethod
  public void install(PluginCall call) {
    if (downloaded == null || !downloaded.exists()) { call.reject("NOT_DOWNLOADED"); return; }
    Context context = getContext();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
      try {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(settings);
      } catch (Exception ignored) { }
      call.reject("INSTALL_PERMISSION_REQUIRED");
      return;
    }
    try {
      Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", downloaded);
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
      call.resolve();
    } catch (Exception error) {
      call.reject("INSTALL_FAILED");
    }
  }

  private void resolveUi(PluginCall call, JSObject result, String failure) {
    Runnable action = () -> { if (failure != null) call.reject(failure); else if (result != null) call.resolve(result); else call.resolve(); };
    if (getActivity() != null) getActivity().runOnUiThread(action); else action.run();
  }
}
