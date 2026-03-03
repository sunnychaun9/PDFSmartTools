plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pdfsmarttools.convert"
    compileSdk = rootProject.extra["compileSdkVersion"] as Int

    defaultConfig {
        minSdk = rootProject.extra["minSdkVersion"] as Int
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(project(":core-utils"))
    implementation(project(":pdf-core"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // ML Kit Text Recognition for OCR
    implementation("com.google.mlkit:text-recognition:16.0.0")

    // Apache POI for Word document processing
    implementation("org.apache.poi:poi:5.2.3")
    implementation("org.apache.poi:poi-ooxml:5.2.3") {
        exclude(group = "org.apache.xmlgraphics", module = "batik-all")
        exclude(group = "de.rototor.pdfbox", module = "graphics2d")
        exclude(group = "org.apache.xmlgraphics", module = "fop")
    }
    implementation("org.apache.poi:poi-scratchpad:5.2.3")
}

// Ensure no React Native leaks into library modules
configurations.all {
    exclude(group = "com.facebook.react")
}
