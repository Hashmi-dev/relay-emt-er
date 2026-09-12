// Relay — Nano 33 BLE Rev2 motion telemetry. No patient vitals are measured.
// Install Arduino_BMI270_BMM150 and select the Nano 33 BLE board.
#include <Arduino_BMI270_BMM150.h>
#include <math.h>

uint32_t sequenceNumber = 0;
uint32_t lastSent = 0;
float ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;
bool haveAcceleration = false, haveGyroscope = false;

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 4000) { delay(10); }
  if (!IMU.begin()) {
    // Intentionally not a telemetry frame; the browser discards diagnostic lines.
    Serial.println("IMU initialization failed. Check board selection and library.");
    while (true) { delay(1000); }
  }
}

void loop() {
  if (IMU.accelerationAvailable()) {
    IMU.readAcceleration(ax, ay, az);
    haveAcceleration = true;
  }
  if (IMU.gyroscopeAvailable()) {
    IMU.readGyroscope(gx, gy, gz);
    haveGyroscope = true;
  }
  const uint32_t now = millis();
  if (Serial && haveAcceleration && haveGyroscope && uint32_t(now - lastSent) >= 200) {
    lastSent = now;
    if (!isfinite(ax) || !isfinite(ay) || !isfinite(az) || !isfinite(gx) || !isfinite(gy) || !isfinite(gz)) return;
    Serial.print("{\"seq\":"); Serial.print(sequenceNumber++);
    Serial.print(",\"uptimeMs\":"); Serial.print(now);
    Serial.print(",\"ax\":"); Serial.print(ax, 4);
    Serial.print(",\"ay\":"); Serial.print(ay, 4);
    Serial.print(",\"az\":"); Serial.print(az, 4);
    Serial.print(",\"gx\":"); Serial.print(gx, 3);
    Serial.print(",\"gy\":"); Serial.print(gy, 3);
    Serial.print(",\"gz\":"); Serial.print(gz, 3);
    Serial.println("}");
    haveAcceleration = false;
    haveGyroscope = false;
  }
}
