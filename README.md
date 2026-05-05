# 🧴 SaniTrack — Smart IoT Hand Sanitizer Dispenser

![IoT](https://img.shields.io/badge/IoT-ESP32-blue?style=flat-square)
![MQTT](https://img.shields.io/badge/MQTT-HiveMQ-orange?style=flat-square)
![React](https://img.shields.io/badge/Frontend-React-61dafb?style=flat-square)
![AI](https://img.shields.io/badge/AI-Claude%20API-purple?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

An end-to-end IoT system that automatically dispenses hand sanitizer when a hand is detected, tracks usage in real time, sends low-sanitizer email alerts, and provides an AI-powered web dashboard — all connected via MQTT over the cloud.

---

## 📸 Demo

> Live Dashboard → [https://1-WaleedAhmad.github.io/sani-track](https://1-WaleedAhmad.github.io/sani-track)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PHYSICAL LAYER                           │
│                                                                 │
│   IR Sensor ──► ESP32 ──► Relay Module ──► DC Pump             │
│   (detects hand)  │       (switches 9V)   (dispenses)          │
│                   │                                             │
└───────────────────┼─────────────────────────────────────────────┘
                    │ WiFi (MQTT over TLS)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD BROKER LAYER                         │
│                                                                 │
│              HiveMQ Cloud (MQTT Broker)                         │
│         Topic: sanitizer/status  (ESP32 → Dashboard)           │
│         Topic: sanitizer/command (Dashboard → ESP32)           │
│                                                                 │
└───────────────────┬─────────────────────────────────────────────┘
                    │ WebSocket (MQTT)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                              │
│                                                                 │
│   React Dashboard (GitHub Pages)                                │
│   ├── Live stats & sanitizer gauge                              │
│   ├── Usage history chart                                       │
│   ├── AI analysis (Claude API)                                  │
│   ├── Email alerts (Formspree)                                  │
│   └── Remote controls (reset, capacity update)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤚 Auto Detection | IR sensor detects hand presence and triggers pump automatically |
| 📊 Live Dashboard | Real-time pump count, remaining level, and sanitizer gauge |
| 🤖 AI Analysis | Claude AI analyzes usage patterns, predicts refill time, and scores hygiene compliance |
| ⚠️ Low Alert | Email notification sent automatically when ≤10 pumps remain |
| 🔄 Remote Reset | Reset pump counter after refilling from the web dashboard |
| ⚙️ Remote Config | Update container capacity remotely via dashboard |
| 📈 Usage History | Bar chart of last 10 dispense events with timestamps |
| 📡 Device Status | Dashboard shows if ESP32 is online or offline |
| 📋 Event Log | Live scrolling log of all system events |

---

## 🛠️ Hardware Components

| Component | Purpose |
|---|---|
| ESP32 (CH9102X) | Main microcontroller — WiFi, logic, MQTT |
| IR Sensor Module (5mm) | Detects hand presence |
| Relay Module (5V) | Switches 9V pump circuit |
| DC Pump (6V) | Dispenses sanitizer |
| 9V Battery | Powers the pump |
| Breadboard + Jumper Wires | Circuit connections |

### Wiring Diagram

```
ESP32 Pin    →  Component
─────────────────────────
GPIO 27      →  IR Sensor OUT
GPIO 33      →  Relay IN
3.3V         →  IR Sensor VCC
VIN (5V)     →  Relay VCC
GND          →  IR Sensor GND + Relay GND

Relay COM    →  9V Battery (+)
Relay NO     →  Pump (+) red wire
9V Battery (-) →  Pump (-) black wire
```

---

## 💻 Software Stack

| Layer | Technology |
|---|---|
| Firmware | Arduino C++ (ESP32) |
| MQTT Broker | HiveMQ Cloud (free tier) |
| Frontend | React 18 + Recharts |
| AI Model | Anthropic Claude API |
| Email Alerts | Formspree |
| Hosting | GitHub Pages |

---

## 🔄 System Flow

```
1. ESP32 boots → connects to WiFi → connects to HiveMQ broker
2. IR sensor monitors for hand presence continuously
3. Hand detected (IR LOW) →
      a. Check if container is empty → block pump if so
      b. Activate relay → pump runs for 2 seconds → relay off
      c. Increment pumpCount and totalAllTime
      d. Publish JSON status to sanitizer/status topic (retained)
4. Dashboard (subscribed to sanitizer/status) receives update →
      a. Updates all stats and gauge in real time
      b. Adds entry to usage history chart
      c. Calls Claude AI for usage analysis
      d. If remaining ≤ 10 → sends email alert via Formspree (once per fill)
5. User can send commands back via sanitizer/command topic →
      a. { command: "reset" } → resets pumpCount to 0 after refill
      b. { capacity: N }     → updates container capacity on device
6. ESP32 receives commands → updates state → publishes new status
```

---

## 📡 MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `sanitizer/status` | ESP32 → Dashboard | `{ pumpCount, totalAllTime, remaining, capacity, lastDispensed, lowWarning, isEmpty }` |
| `sanitizer/command` | Dashboard → ESP32 | `{ command: "reset" }` or `{ capacity: N }` |

---

## 🚀 Getting Started

### Prerequisites
- Arduino IDE with ESP32 board support installed
- Node.js and npm installed
- HiveMQ Cloud free account
- Formspree free account

### 1. Flash the ESP32

1. Open `sanitizer_esp32.ino` in Arduino IDE
2. Install required libraries:
   - `PubSubClient` by Nick O'Leary
   - `ArduinoJson` by Benoit Blanchon
3. Update credentials in the code:
```cpp
const char* ssid         = "YOUR_WIFI_NAME";
const char* password     = "YOUR_WIFI_PASSWORD";
const char* mqtt_server  = "YOUR_HIVEMQ_URL";
const char* mqtt_user    = "YOUR_MQTT_USERNAME";
const char* mqtt_password = "YOUR_MQTT_PASSWORD";
```
4. Select board: `ESP32 Dev Module`
5. Upload the code

### 2. Run the Dashboard Locally

```bash
git clone https://github.com/1-WaleedAhmad/sani-track.git
cd sani-track
npm install
npm start
```

### 3. Deploy to GitHub Pages

```bash
npm run deploy
```

---

## 📁 Project Structure

```
sani-track/
├── public/
│   └── index.html          # HTML entry point
├── src/
│   ├── index.js            # React entry point
│   └── App.js              # Main dashboard component
├── sanitizer_esp32.ino     # ESP32 Arduino firmware
├── package.json
└── README.md
```

---

## 🤖 AI Analysis

The dashboard uses the **Claude API** to analyze live sensor data and provide:

- **Status Assessment** — current fill level and urgency
- **Refill Prediction** — estimated hours until empty based on usage rate
- **Hygiene Compliance Score** — 0–100 score based on pump frequency compared to ideal public dispenser usage (15–40 pumps/hour)
- **Usage Trend** — detects if usage is increasing, decreasing, or stable

---

## 📧 Email Alert System

Powered by **Formspree** (free, no backend needed). When sanitizer drops to ≤10 pumps remaining:

1. Dashboard detects threshold breach from MQTT message
2. Sends POST request to Formspree endpoint
3. Email delivered to configured address with remaining count, timestamp, and all-time total
4. Alert fires only **once per fill** — resets automatically after container is refilled

---

## 📋 Project Requirements Met

This project satisfies the following IoT course requirements:

- ✅ **Sensor board with wireless module** — ESP32 with built-in WiFi
- ✅ **At least one sensor** — IR infrared sensor for hand detection
- ✅ **Mechanical actuator** — DC liquid pump controlled via relay
- ✅ **Wireless data transmission** — MQTT over TLS to HiveMQ Cloud
- ✅ **MQTT broker** — HiveMQ Cloud (cloud-hosted)
- ✅ **Web app dashboard** — React app on GitHub Pages
- ✅ **Frontend via broker only** — dashboard never talks to ESP32 directly
- ✅ **Cloud-hosted AI model** — Anthropic Claude API for analytics

---

## 👨‍💻 Author

**Muhammad Waleed**
IoT Course Project — 2026

---

## 📄 License

feel free to use and modify for your own projects.
