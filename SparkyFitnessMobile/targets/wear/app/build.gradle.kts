plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "com.sparkyapps.sparkyfitness.wear"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.sparkyapps.sparkyfitness.wear"
    minSdk = 30
    targetSdk = 34
    versionCode = 1
    versionName = "1.0.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  buildFeatures {
    compose = true
  }
}

dependencies {
  implementation("androidx.activity:activity-compose:1.9.3")
  implementation("androidx.compose.ui:ui:1.7.6")
  implementation("androidx.compose.ui:ui-tooling-preview:1.7.6")
  implementation("androidx.wear.compose:compose-foundation:1.4.1")
  implementation("androidx.wear.compose:compose-material:1.4.1")
  implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
