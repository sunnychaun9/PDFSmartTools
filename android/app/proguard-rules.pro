# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Apache POI - ignore missing AWT classes (not available on Android)
-dontwarn java.awt.**
-dontwarn javax.swing.**
-dontwarn java.beans.**

# Apache POI XML/Streaming
-dontwarn javax.xml.stream.**

# Apache XMLBeans / Saxon (used by POI for XPath)
-dontwarn net.sf.saxon.**
-dontwarn org.apache.xmlbeans.**

# Apache Batik (SVG rendering - not used on Android)
-dontwarn org.apache.batik.**

# PDFBox - JP2 codec (optional dependency)
-dontwarn com.gemalto.jp2.**

# OSGI framework (not used on Android)
-dontwarn org.osgi.framework.**

# Log4j OSGI service locator
-dontwarn org.apache.logging.log4j.util.OsgiServiceLocator

# Keep Apache POI classes
-keep class org.apache.poi.** { *; }
-keep class org.apache.xmlbeans.** { *; }

# Keep PDFBox classes
-keep class com.tom_roush.pdfbox.** { *; }

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
