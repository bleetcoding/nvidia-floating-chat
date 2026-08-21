const { withAndroidManifest, withDangerousMod, withMainApplication, createRunOncePlugin } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "with-floating-bubble";

function ensurePermission(manifest, name) {
  const permissions = manifest["uses-permission"] || [];
  if (!permissions.some((entry) => entry.$?.["android:name"] === name)) {
    permissions.push({ $: { "android:name": name } });
  }
  manifest["uses-permission"] = permissions;
}

function withBubbleManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.POST_NOTIFICATIONS",
    ].forEach((permission) => ensurePermission(manifest, permission));
    const application = manifest.application?.[0];
    if (!application) throw new Error("Android application manifest node was not found.");
    const services = application.service || [];
    if (!services.some((service) => service.$?.["android:name"] === ".FloatingBubbleService")) {
      services.push({
        $: {
          "android:name": ".FloatingBubbleService",
          "android:exported": "false",
          "android:foregroundServiceType": "specialUse",
        },
        property: [{
          $: {
            "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE",
            "android:value": "Maintains a user-controlled floating AI chat bubble above other apps.",
          },
        }],
      });
    }
    application.service = services;
    return config;
  });
}

function javaSources(packageName, scheme) {
  const packagePath = packageName.replace(/\./g, "/");
  const service = `package ${packageName};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

public class FloatingBubbleService extends Service {
  private static final String CHANNEL_ID = "floating_chat_channel";
  private static final int NOTIFICATION_ID = 742;
  private static final String ACTION_REFRESH = "${packageName}.REFRESH_FLOATING_BUBBLE";
  private WindowManager windowManager;
  private TextView bubble;
  private WindowManager.LayoutParams layoutParams;

  @Override public void onCreate() {
    super.onCreate();
    createChannel();
    startForeground(NOTIFICATION_ID, createNotification());
    showBubble();
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && ACTION_REFRESH.equals(intent.getAction()) && bubble != null && windowManager != null) {
      windowManager.removeView(bubble);
      bubble = null;
      showBubble();
    }
    return START_STICKY;
  }

  private Notification createNotification() {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("${scheme}://chat"));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    return new Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Floating chat is active")
      .setContentText("Tap to return to your AI conversation")
      .setSmallIcon(getApplicationInfo().icon)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Floating chat", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Required while the floating chat bubble is active");
      ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
  }

  private void showBubble() {
    windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    bubble = new TextView(this);
    bubble.setText("AI");
    bubble.setTextColor(Color.rgb(8, 16, 0));
    bubble.setTextSize(15);
    bubble.setGravity(Gravity.CENTER);
    bubble.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
    GradientDrawable background = new GradientDrawable();
    background.setShape(GradientDrawable.OVAL);
    background.setColor(Color.parseColor(preferences().getString("color", "#76B900")));
    background.setStroke(2, Color.rgb(181, 232, 83));
    bubble.setBackground(background);
    final int size = dp(preferences().getInt("sizeDp", 58));
    layoutParams = new WindowManager.LayoutParams(size, size, Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
    layoutParams.gravity = Gravity.TOP | Gravity.START;
    layoutParams.x = dp(18);
    layoutParams.y = dp(220);
    bubble.setOnTouchListener(new View.OnTouchListener() {
      private float downRawX;
      private float downRawY;
      private int downX;
      private int downY;
      private boolean moved;
      @Override public boolean onTouch(View view, MotionEvent event) {
        switch (event.getAction()) {
          case MotionEvent.ACTION_DOWN:
            downRawX = event.getRawX(); downRawY = event.getRawY(); downX = layoutParams.x; downY = layoutParams.y; moved = false; return true;
          case MotionEvent.ACTION_MOVE:
            float deltaX = event.getRawX() - downRawX; float deltaY = event.getRawY() - downRawY;
            moved = Math.abs(deltaX) > dp(6) || Math.abs(deltaY) > dp(6);
            layoutParams.x = downX + (int) deltaX; layoutParams.y = downY + (int) deltaY;
            windowManager.updateViewLayout(bubble, layoutParams); return true;
          case MotionEvent.ACTION_UP:
            if (!moved) openChat();
            return true;
          default: return false;
        }
      }
    });
    windowManager.addView(bubble, layoutParams);
  }

  private void openChat() {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("${scheme}://chat"));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    startActivity(intent);
  }

  private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
  private android.content.SharedPreferences preferences() { return getSharedPreferences("floating_bubble", 0); }
  @Override public void onDestroy() { if (bubble != null && windowManager != null) windowManager.removeView(bubble); super.onDestroy(); }
  @Override public IBinder onBind(Intent intent) { return null; }
}`;
  const module = `package ${packageName};

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class FloatingBubbleModule extends ReactContextBaseJavaModule {
  FloatingBubbleModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "FloatingBubble"; }
  @ReactMethod public void isOverlayPermissionGranted(Promise promise) { promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getReactApplicationContext())); }
  @ReactMethod public void isBubbleEnabled(Promise promise) { promise.resolve(getReactApplicationContext().getSharedPreferences("floating_bubble", 0).getBoolean("enabled", false)); }
  @ReactMethod public void getAppearance(Promise promise) {
    android.content.SharedPreferences preferences = getReactApplicationContext().getSharedPreferences("floating_bubble", 0);
    WritableMap appearance = Arguments.createMap(); appearance.putInt("sizeDp", preferences.getInt("sizeDp", 58)); appearance.putString("color", preferences.getString("color", "#76B900")); promise.resolve(appearance);
  }
  @ReactMethod public void updateAppearance(double sizeDp, String color, Promise promise) {
    if (color == null || !color.matches("^#[0-9A-Fa-f]{6}$")) { promise.reject("INVALID_BUBBLE_COLOR", "Bubble color must be a six-digit hex color."); return; }
    int normalizedSize = Math.max(42, Math.min(92, (int) Math.round(sizeDp)));
    android.content.SharedPreferences preferences = getReactApplicationContext().getSharedPreferences("floating_bubble", 0);
    preferences.edit().putInt("sizeDp", normalizedSize).putString("color", color.toUpperCase()).apply();
    if (preferences.getBoolean("enabled", false)) {
      Intent refresh = new Intent(getReactApplicationContext(), FloatingBubbleService.class); refresh.setAction("${packageName}.REFRESH_FLOATING_BUBBLE"); getReactApplicationContext().startService(refresh);
    }
    promise.resolve(true);
  }
  @ReactMethod public void requestOverlayPermission(Promise promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getReactApplicationContext())) { promise.resolve(true); return; }
    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getReactApplicationContext().getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getReactApplicationContext().startActivity(intent); promise.resolve(false);
  }
  @ReactMethod public void startBubble(Promise promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getReactApplicationContext())) { promise.reject("OVERLAY_PERMISSION_REQUIRED", "Display-over-other-apps permission is required."); return; }
    Intent intent = new Intent(getReactApplicationContext(), FloatingBubbleService.class);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getReactApplicationContext().startForegroundService(intent); else getReactApplicationContext().startService(intent);
    getReactApplicationContext().getSharedPreferences("floating_bubble", 0).edit().putBoolean("enabled", true).apply(); promise.resolve(true);
  }
  @ReactMethod public void stopBubble(Promise promise) { getReactApplicationContext().stopService(new Intent(getReactApplicationContext(), FloatingBubbleService.class)); getReactApplicationContext().getSharedPreferences("floating_bubble", 0).edit().putBoolean("enabled", false).apply(); promise.resolve(true); }
}`;
  const packageSource = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class FloatingBubblePackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) { List<NativeModule> modules = new ArrayList<>(); modules.add(new FloatingBubbleModule(context)); return modules; }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
}`;
  return { packagePath, service, module, packageSource };
}

function withBubbleNativeSources(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const packageName = config.android?.package;
    const scheme = config.scheme || "nvidiafloatingchat";
    if (!packageName) throw new Error("Android package name is required for floating bubble integration.");
    const { packagePath, service, module, packageSource } = javaSources(packageName, scheme);
    const javaDirectory = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", packagePath);
    fs.mkdirSync(javaDirectory, { recursive: true });
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubbleService.java"), service);
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubbleModule.java"), module);
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubblePackage.java"), packageSource);
    return config;
  }]);
}

function withBubblePackage(config) {
  return withMainApplication(config, (config) => {
    const packageName = config.android?.package;
    if (!packageName) throw new Error("Android package name is required for floating bubble integration.");
    const importLine = `import ${packageName}.FloatingBubblePackage`;
    if (!config.modResults.contents.includes(importLine)) {
      config.modResults.contents = config.modResults.contents.replace(/(package [^\n]+\n)/, `$1\n${importLine}\n`);
    }
    if (!config.modResults.contents.includes("FloatingBubblePackage()")) {
      config.modResults.contents = config.modResults.contents.replace(/(PackageList\(this\)\.packages\.apply \{)/, "$1\n      add(FloatingBubblePackage())");
    }
    return config;
  });
}

module.exports = createRunOncePlugin((config) => withBubblePackage(withBubbleNativeSources(withBubbleManifest(config))), PLUGIN_NAME, "1.0.0");
