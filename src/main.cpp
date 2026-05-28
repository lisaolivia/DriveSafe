/*********
  Rui Santos & Sara Santos - Random Nerd Tutorials
  Complete project details at https://RandomNerdTutorials.com/esp32-mpu-6050-web-server/
*********/
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Arduino_JSON.h>
#include <LittleFS.h>

#include "wifi_credentials.h"

static const uint8_t MPU_ADDR = 0x68;

AsyncWebServer server(80);
AsyncEventSource events("/events");

JSONVar readings;

unsigned long lastTime = 0;
unsigned long lastTimeTemperature = 0;
unsigned long lastTimeAcc = 0;
// How often readings are sent to the browser (milliseconds)
unsigned long gyroDelay = 5;            // ~200 Hz — 3D orientation
unsigned long temperatureDelay = 1000;  // ~1 Hz
unsigned long accelerometerDelay = 25;  // ~40 Hz — shock detection preview

Adafruit_MPU6050 mpu;
bool useAdafruitMpu = false;

sensors_event_t a, g, temp;

float gyroX, gyroY, gyroZ;
float accX, accY, accZ;
float temperature;

float gyroXerror = 0.07;
float gyroYerror = 0.03;
float gyroZerror = 0.01;

bool isSupportedWhoAmI(uint8_t who) {
  return who == 0x68 || who == 0x70 || who == 0x71 || who == 0x72 ||
         who == 0x98;
}

uint8_t mpuReadReg(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return 0xFF;
  }
  if (Wire.requestFrom(MPU_ADDR, (uint8_t)1) != 1) {
    return 0xFF;
  }
  return Wire.read();
}

int16_t mpuRead16(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return 0;
  }
  if (Wire.requestFrom(MPU_ADDR, (uint8_t)2) != 2) {
    return 0;
  }
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  return (int16_t)((hi << 8) | lo);
}

void mpuWake() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();
  delay(50);
}

void mpuConfigRaw() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);
  Wire.write(0x00);
  Wire.endTransmission();
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1B);
  Wire.write(0x00);
  Wire.endTransmission();
}

void readMpuRaw() {
  int16_t ax = mpuRead16(0x3B);
  int16_t ay = mpuRead16(0x3D);
  int16_t az = mpuRead16(0x3F);
  int16_t tempRaw = mpuRead16(0x41);
  int16_t gx = mpuRead16(0x43);
  int16_t gy = mpuRead16(0x45);
  int16_t gz = mpuRead16(0x47);

  const float accelScale = 16384.0f;
  const float gyroScale = 131.0f;
  const float gToMs2 = 9.80665f;
  const float degToRad = PI / 180.0f;

  a.acceleration.x = (ax / accelScale) * gToMs2;
  a.acceleration.y = (ay / accelScale) * gToMs2;
  a.acceleration.z = (az / accelScale) * gToMs2;

  g.gyro.x = (gx / gyroScale) * degToRad;
  g.gyro.y = (gy / gyroScale) * degToRad;
  g.gyro.z = (gz / gyroScale) * degToRad;

  temp.temperature = 36.53f + (tempRaw / 340.0f);
}

void updateSensorData() {
  if (useAdafruitMpu) {
    mpu.getEvent(&a, &g, &temp);
  } else {
    readMpuRaw();
  }
}

void initMPU() {
  Wire.begin(21, 22);
  Wire.setClock(400000);
  delay(100);
  mpuWake();

  uint8_t who = mpuReadReg(0x75);
  Serial.printf("WHO_AM_I register = 0x%02X\n", who);

  for (int attempt = 1; attempt <= 3; attempt++) {
    if (mpu.begin(0x68, &Wire)) {
      useAdafruitMpu = true;
      Serial.println("MPU6050 Found (Adafruit library)!");
      return;
    }
    Serial.printf("Adafruit begin attempt %d failed\n", attempt);
    mpuWake();
    delay(200);
  }

  if (isSupportedWhoAmI(who)) {
    mpuConfigRaw();
    useAdafruitMpu = false;
    Serial.println("MPU6050 OK (raw I2C mode — clone chip)");
    return;
  }

  Serial.println("Failed to find MPU6050 chip");
  Serial.printf("Unknown chip ID 0x%02X at address 0x68\n", who);
  while (1) {
    delay(10);
  }
}

void initLittleFS() {
  if (!LittleFS.begin()) {
    Serial.println("An error has occurred while mounting LittleFS");
  }
  Serial.println("LittleFS mounted successfully");
}

void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println();
  Serial.println(WiFi.localIP());
}

String getGyroReadings() {
  updateSensorData();

  float gyroX_temp = g.gyro.x;
  if (abs(gyroX_temp) > gyroXerror) {
    gyroX += gyroX_temp / 50.00;
  }

  float gyroY_temp = g.gyro.y;
  if (abs(gyroY_temp) > gyroYerror) {
    gyroY += gyroY_temp / 70.00;
  }

  float gyroZ_temp = g.gyro.z;
  if (abs(gyroZ_temp) > gyroZerror) {
    gyroZ += gyroZ_temp / 90.00;
  }

  readings["gyroX"] = String(gyroX);
  readings["gyroY"] = String(gyroY);
  readings["gyroZ"] = String(gyroZ);

  return JSON.stringify(readings);
}

String getAccReadings() {
  updateSensorData();
  accX = a.acceleration.x;
  accY = a.acceleration.y;
  accZ = a.acceleration.z;
  readings["accX"] = String(accX);
  readings["accY"] = String(accY);
  readings["accZ"] = String(accZ);
  return JSON.stringify(readings);
}

String getTemperature() {
  updateSensorData();
  temperature = temp.temperature;
  return String(temperature);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  initMPU();
  initWiFi();
  initLittleFS();

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(LittleFS, "/index.html", "text/html");
  });

  server.serveStatic("/", LittleFS, "/");

  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest *request) {
    gyroX = 0;
    gyroY = 0;
    gyroZ = 0;
    request->send(200, "text/plain", "OK");
  });

  server.on("/resetX", HTTP_GET, [](AsyncWebServerRequest *request) {
    gyroX = 0;
    request->send(200, "text/plain", "OK");
  });

  server.on("/resetY", HTTP_GET, [](AsyncWebServerRequest *request) {
    gyroY = 0;
    request->send(200, "text/plain", "OK");
  });

  server.on("/resetZ", HTTP_GET, [](AsyncWebServerRequest *request) {
    gyroZ = 0;
    request->send(200, "text/plain", "OK");
  });

  events.onConnect([](AsyncEventSourceClient *client) {
    if (client->lastId()) {
      Serial.printf("Client reconnected! Last message ID that it got is: %u\n",
                    client->lastId());
    }
    client->send("hello!", NULL, millis(), 10000);
  });
  server.addHandler(&events);

  server.begin();
}

void loop() {
  if ((millis() - lastTime) > gyroDelay) {
    events.send(getGyroReadings().c_str(), "gyro_readings", millis());
    lastTime = millis();
  }
  if ((millis() - lastTimeAcc) > accelerometerDelay) {
    events.send(getAccReadings().c_str(), "accelerometer_readings", millis());
    lastTimeAcc = millis();
  }
  if ((millis() - lastTimeTemperature) > temperatureDelay) {
    events.send(getTemperature().c_str(), "temperature_reading", millis());
    lastTimeTemperature = millis();
  }
}
