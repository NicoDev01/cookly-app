# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable


# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Fix for R8 missing class errors with okio/retrofit
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.ParametersAreNonnullByDefault

# ============================================================
# Capacitor: Keep all plugin classes and their methods
# Without these rules, R8/ProGuard obfuscates Capacitor bridge
# classes causing the WebView<->Native bridge to break silently
# ============================================================

# Capacitor Core Bridge
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Capacitor Plugin annotations
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
    @com.getcapacitor.PluginMethod <methods>;
    public <methods>;
}

# Lottie Splash Screen plugin (com.ludufre package)
-keep class com.ludufre.plugins.lottiesplashscreen.** { *; }
-dontwarn com.ludufre.plugins.lottiesplashscreen.**
-keep class com.capacitorjs.lottiesplashscreen.** { *; }
-dontwarn com.capacitorjs.lottiesplashscreen.**

# Capacitor official plugins
-keep class com.capacitorjs.plugins.** { *; }
-dontwarn com.capacitorjs.plugins.**

# SuperNotes SendIntent plugin
-keep class net.supernotes.capacitor.** { *; }
-dontwarn net.supernotes.capacitor.**
-keep class app.supernotes.sendIntent.** { *; }
-dontwarn app.supernotes.sendIntent.**

# Lottie animation library (used by splash screen)
-keep class com.airbnb.lottie.** { *; }
-dontwarn com.airbnb.lottie.**

# Keep JavaScript interface methods (WebView bridge)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

