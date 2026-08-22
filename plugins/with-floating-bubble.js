const { withAndroidManifest, withDangerousMod, withMainApplication, createRunOncePlugin } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "with-floating-bubble";
const nativeRoot = path.join(__dirname, "native");

function ensurePermission(manifest, name) {
  const permissions = manifest["uses-permission"] || [];
  if (!permissions.some((entry) => entry.$?.["android:name"] === name)) permissions.push({ $: { "android:name": name } });
  manifest["uses-permission"] = permissions;
}

function withBubbleManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_SPECIAL_USE", "android.permission.POST_NOTIFICATIONS", "android.permission.RECORD_AUDIO"].forEach((permission) => ensurePermission(manifest, permission));
    const queryNode = manifest.queries?.[0] || {};
    const queryIntents = queryNode.intent || [];
    if (!queryIntents.some((entry) => JSON.stringify(entry).includes("android.speech.RecognitionService"))) queryIntents.push({ action: [{ $: { "android:name": "android.speech.RecognitionService" } }] });
    queryNode.intent = queryIntents;
    manifest.queries = [queryNode];
    const application = manifest.application?.[0];
    if (!application) throw new Error("Android application manifest node was not found.");
    const services = application.service || [];
    if (!services.some((service) => service.$?.["android:name"] === ".FloatingBubbleService")) {
      services.push({ $: { "android:name": ".FloatingBubbleService", "android:exported": "false", "android:foregroundServiceType": "specialUse" }, property: [{ $: { "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE", "android:value": "Maintains a user-controlled floating AI response panel above other apps." } }] });
    }
    if (!services.some((service) => service.$?.["android:name"] === ".FloatingTextContextService")) {
      services.push({ $: { "android:name": ".FloatingTextContextService", "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE", "android:exported": "true", "android:label": "Floating AI Chat Context" }, "intent-filter": [{ action: [{ $: { "android:name": "android.accessibilityservice.AccessibilityService" } }] }], "meta-data": [{ $: { "android:name": "android.accessibilityservice", "android:resource": "@xml/floating_ai_context_service" } }] });
    }
    application.service = services;
    return config;
  });
}

function applyTemplate(filename, packageName, scheme) {
  return fs.readFileSync(path.join(nativeRoot, filename), "utf8").replaceAll("__PACKAGE__", packageName).replaceAll("__SCHEME__", scheme);
}

function packageSource(packageName) {
  return `package ${packageName};

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
}

function withBubbleNativeSources(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const packageName = config.android?.package;
    const scheme = config.scheme || "nvidiafloatingchat";
    if (!packageName) throw new Error("Android package name is required for floating bubble integration.");
    const packagePath = packageName.replace(/\./g, "/");
    const javaDirectory = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", packagePath);
    const resourcesDirectory = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res");
    fs.mkdirSync(javaDirectory, { recursive: true });
    fs.mkdirSync(path.join(resourcesDirectory, "xml"), { recursive: true });
    fs.mkdirSync(path.join(resourcesDirectory, "values"), { recursive: true });
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubbleService.java"), applyTemplate("FloatingBubbleService.java.template", packageName, scheme));
    fs.writeFileSync(path.join(javaDirectory, "FloatingTextContextService.java"), applyTemplate("FloatingTextContextService.java.template", packageName, scheme));
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubbleModule.java"), applyTemplate("FloatingBubbleModule.java.template", packageName, scheme));
    fs.writeFileSync(path.join(javaDirectory, "FloatingBubblePackage.java"), packageSource(packageName));
    fs.copyFileSync(path.join(nativeRoot, "floating_ai_context_service.xml"), path.join(resourcesDirectory, "xml", "floating_ai_context_service.xml"));
    fs.copyFileSync(path.join(nativeRoot, "floating_ai_context_strings.xml"), path.join(resourcesDirectory, "values", "floating_ai_context_strings.xml"));
    return config;
  }]);
}

function withBubblePackage(config) {
  return withMainApplication(config, (config) => {
    const packageName = config.android?.package;
    if (!packageName) throw new Error("Android package name is required for floating bubble integration.");
    const importLine = `import ${packageName}.FloatingBubblePackage`;
    if (!config.modResults.contents.includes(importLine)) config.modResults.contents = config.modResults.contents.replace(/(package [^\n]+\n)/, `$1\n${importLine}\n`);
    if (!config.modResults.contents.includes("FloatingBubblePackage()")) config.modResults.contents = config.modResults.contents.replace(/(PackageList\(this\)\.packages\.apply \{)/, "$1\n      add(FloatingBubblePackage())");
    return config;
  });
}

module.exports = createRunOncePlugin((config) => withBubblePackage(withBubbleNativeSources(withBubbleManifest(config))), PLUGIN_NAME, "2.2.0");
