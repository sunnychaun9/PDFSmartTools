# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Java AWT/Swing/Beans (not available on Android)
-dontwarn java.awt.**
-dontwarn javax.swing.**
-dontwarn java.beans.**
-dontwarn javax.imageio.**

# XML Streaming API
-dontwarn javax.xml.stream.**

# XML Crypto/Digital Signatures
-dontwarn javax.xml.crypto.**

# Apache XMLBeans / Saxon
-dontwarn net.sf.saxon.**
-dontwarn org.apache.xmlbeans.**

# Apache Batik SVG
-dontwarn org.apache.batik.**

# Apache XML Security
-dontwarn org.apache.xml.security.**
-dontwarn org.apache.jcp.xml.dsig.**

# Apache PDFBox (desktop version referenced by POI)
-dontwarn org.apache.pdfbox.**

# PDFBox Android - JP2 codec
-dontwarn com.gemalto.jp2.**

# PDFBox Graphics2D
-dontwarn de.rototor.pdfbox.graphics2d.**

# OSGI framework
-dontwarn org.osgi.framework.**

# Log4j
-dontwarn org.apache.logging.log4j.**

# JGSS (Kerberos)
-dontwarn org.ietf.jgss.**

# W3C DOM extensions
-dontwarn org.w3c.dom.events.**
-dontwarn org.w3c.dom.svg.**
-dontwarn org.w3c.dom.traversal.**

# Keep Apache POI classes
-keep class org.apache.poi.** { *; }
-keep class org.apache.xmlbeans.** { *; }

# Keep PDFBox Android classes
-keep class com.tom_roush.pdfbox.** { *; }

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
