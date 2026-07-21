#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPS++.h>

// Wi-Fi данни 
const char* ssid = "Redmi Note 13 Pro";
const char* password = "butterfly_12345";

// Твоят IP адрес на компютъра (Visual Studio сървъра)
const char* serverName = "http://10.196.131.143:3000/api/telemetry";

// Използваме безопасни пинове D12 и D13
#define RXD2 12   // TX на GPS към Pin D12 на ESP32
#define TXD2 13   // RX на GPS към Pin D13 на ESP32
#define GPS_BAUD 9600

HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

unsigned long lastPrintTime = 0;
const unsigned long PRINT_INTERVAL = 5000;

void setup() {
  Serial.begin(115200);
  delay(1000); 
  
  Serial.println("\n--- СТАРТИРАНЕ НА СИСТЕМАТА ---");
  
  // Инициализираме GPS-а с пренасочени пинове 12 и 13
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXD2, TXD2);
  Serial.println("🛰️ GPS портът е инициализиран успешно.");

  // Стартираме свързването към Wi-Fi, БЕЗ да блокираме кода с цикъл
  Serial.println("🌐 Опит за първоначално свързване с Wi-Fi...");
  WiFi.begin(ssid, password);
}

void loop() {
  // Постоянно четем данните от GPS модула
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Изпълнява се на всеки 5 секунди
  if (millis() - lastPrintTime >= PRINT_INTERVAL) {
    lastPrintTime = millis();
    
    // Проверяваме статуса на Wi-Fi мрежата
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("🌐 Wi-Fi Статус: СВЪРЗАН");
    } else {
      Serial.println("❌ Wi-Fi Статус: НЯМА ВРЪЗКА (Опит за автоматично пресвързване...)");
      // Ако е прекъснал или не се е свързал, инициираме ново свързване в движение
      WiFi.begin(ssid, password); 
    }
    
    // Проверяваме дали GPS-ът има валидни координати
    if (gps.location.isValid()) {
      float lat = gps.location.lat();
      float lng = gps.location.lng();
      
      Serial.print("🛰️ Локация от GPS: ");
      Serial.print(lat, 6);
      Serial.print(", ");
      Serial.println(lng, 6);
      
      // Ако имаме И интернет, пращаме данните към Visual Studio
      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverName);
        http.addHeader("Content-Type", "application/json");
        
        String jsonPayload = "{\"collarId\":\"CLR-1004\",\"lat\":" + String(lat, 6) + 
                             ",\"lng\":" + String(lng, 6) + 
                             ",\"pulse\":72,\"temperature\":38.5,\"battery\":92}";
                             
        int httpResponseCode = http.POST(jsonPayload);
        Serial.print("📡 HTTP Код от сървъра: ");
        Serial.println(httpResponseCode);
        http.end();
      } else {
        Serial.println("⚠️ Данните не са изпратени към сървъра, защото няма Wi-Fi връзка.");
      }
    } else {
      Serial.println("⏳ Изчакване на стабилен GPS сигнал (Сателити: " + String(gps.satellites.value()) + ")...");
    }
    Serial.println("---------------------------------------------");
  }
}