plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pdfsmarttools.sign"
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
}

// Ensure no React Native leaks into library modules
configurations.all {
    exclude(group = "com.facebook.react")
}
