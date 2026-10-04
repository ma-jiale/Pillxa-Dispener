<p align="center">
  <img src="images/MainPhoto.jpg" alt="EZ-Dose Smart Medication Dispensing System" width="600"/>
</p>

<h1 align="center">EZ-Dose Smart Medication Dispensing System</h1>

<p align="center">
  <b>Intelligent Medication Management for Healthcare Facilities</b><br>
  <sub>Prescription Management · Automated Dispensing · Full Traceability</sub>
</p>

<p align="center">
  English | <a href="./README.md">中文</a>
</p>

---

> **V1 Maintenance Notice**:
> - `client`: Unity (Windows x64 / Android compatibility)
> - `server`: Flask + SQLite
> 
> As of 2026-10-04, V1 is the only maintained generation and the V2 rebuild is retired. Development continues in this directory. Frozen baselines remain available through Git tags and do not describe the current working tree. See the [repository README](../../README.md).

## 📖 Overview

EZ-Dose is an **intelligent medication management system** designed for nursing homes and healthcare facilities. It provides a complete multi-platform interaction system for STM32-based automatic pill dispensers, covering the entire workflow from **Prescription Management → Dispensing Control → Operation Logging**.

### Core Value

> In medication dispensing scenarios at healthcare facilities, EZ-Dose transforms the traditional process—which relies on caregivers' memory, calculations, and physical labor—into a collaborative workflow where the **system leads and caregivers supervise**. This approach **reduces cognitive load**, **minimizes physical labor**, and achieves **fully traceable** medication management.

### System Components

| Component | Description | Tech Stack |
|-----------|-------------|------------|
| 🌐 **Prescription Management Website** | Manage patient info, enter prescriptions, view dispensing logs | Flask + SQLite |
| 📱 **Dispensing Control APP** | Connect to dispenser, scan barcodes, control dispensing process | Unity + Android |
| 🔧 **Hardware Interface** | Bluetooth module configuration tools | Python + Serial |

---

## 🏗️ System Architecture

EZ-Dose System Architecture Diagram

![System Architecture](images/系统架构图.png)

---

## 📋 Features

- ✅ **Patient Management** - Manage patient information, print medication box labels
- ✅ **Prescription Management** - Enter and manage prescriptions with multi-time-period dosing
- ✅ **Smart Dispensing** - APP-guided dispensing process with automatic dispenser control
- ✅ **Pill Calibration** - Automatic size and image data collection for new medications
- ✅ **Barcode Recognition** - Scan box labels to automatically match patient information
- ✅ **Dispensing Records** - Complete logging of all dispensing operations with query support
- ✅ **Permission Management** - Role-based access control (doctor, nurse, administrator)

---

## 🚀 Quick Start

### Prerequisites

- Python 3.7+ (for hardware configuration scripts; see the separate `EZ_Dose_server` repository for the backend)
- Unity 6.3 (this project currently uses Unity 6000.3.2f1)
- Huawei MatePad running HarmonyOS 4 (Android-based)
- HC-06 Bluetooth Serial Module
- STM32-based Automatic Pill Dispenser

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/EZ-Dose.git
cd EZ-Dose
```

### 2️⃣ Configure Bluetooth Module

Since the STM32 microcontroller in the pill dispenser lacks Bluetooth capability, an HC-06 Bluetooth serial module must be added.

HC-06 Bluetooth Serial Module

<img src="images/image-20260204123339711.png" alt="HC-06 Bluetooth Module" width="300"/>

#### Modify Baud Rate

The STM32 serial communication uses 115200 baud, but HC-06 defaults to 9600. They must match:

```bash
# Install dependencies
pip install pyserial

# List available serial ports
python hardware/hc06_baudrate_configurator.py --list

# Modify baud rate (replace COM6 with your actual port)
python hardware/hc06_baudrate_configurator.py --port COM6 --current-baud 9600 --target-baud 115200
```

#### Modify Bluetooth Name (Optional)

```bash
python hardware/hc06_name_configurator.py --port COM6 --name "PillDispenserXX"
```

#### Voltage Conversion Circuit

Since HC-06 operates at 3.3V logic level and STM32 at 5V, a voltage divider circuit using 1kΩ and 2kΩ resistors is required:

Voltage Divider Circuit Schematic

<img src="images/image-20260204123442739.png" alt="Circuit Schematic" width="300"/>

Physical Wiring Diagram

<img src="images/2f036d90c4fdd007d465ec7600c208fd.jpg" alt="Physical Wiring" width="400"/>

#### Pin Connections

Connect the control board and Bluetooth module according to the following diagram:

Pin Connection Diagram

<img src="images/image-20260204123818392.png" alt="Pin Connections" width="400"/>

> **✅ Verification**: The Bluetooth module indicator LED flashing continuously after power-on indicates successful connection

### 3️⃣ Prepare Backend Server

```bash
# Backend code lives in a separate repository
git clone https://github.com/your-username/EZ_Dose_server.git
cd EZ_Dose_server
```

Follow the `EZ_Dose_server` README to start the Flask backend, then set the corresponding server address in the APP settings page.
The Unity client default server URL remains `http://127.0.0.1:5000`; on an Android tablet, this usually needs to be changed to the LAN IP of the backend server.

#### Public Access (Optional)

For external access, use Nginx reverse proxy or tunneling tools (ngrok, frp). The URL prefix, port, and deployment details should follow the `EZ_Dose_server` repository configuration:

```python
# Uncomment for remote deployment
URL_PREFIX = '/flask'
```

### 4️⃣ Build Dispensing Control APP

1. Open the `unity` directory with Unity Hub
2. Confirm `Assets/OpenCVForUnity`, `Assets/Plugins/Zxing`, and `Assets/Plugins/Android/bluetooth-serial.aar` are present
3. Select **File → Build Settings**, switch platform to **Android**
4. Click **Build And Run** to compile and install on MatePad

> **⚠️ Note**: After installation, manually enable **Nearby Devices Access** permission in system settings.

---

## 📖 Usage Guide

### Workflow Overview

EZ-Dose System Workflow Diagram

![Workflow Diagram](images/使用流程图.png)

---

### 🌐 Prescription Management Website

#### Login

After starting the backend server, visit the configured login address, for example `http://server-address/login`; the port and URL prefix should follow the `EZ_Dose_server` deployment configuration.

Login Page

![Login Page](images/web_login_page.png)

> **Default Admin Account**  
> Username: `admin`  
> Password: `admin123`  
> Please change password after first login

#### Main Dashboard

The dashboard contains four main modules: **User Management**, **Patient Management**, **Prescription Management**, and **System Records**

Dashboard

![Dashboard](images/image-20260204134632640.png)

#### User Management

Add new users and modify existing user information. Configure different permissions for various roles (doctor, nurse, director, etc.)

User Management Interface

![User Management](images/image-20260204134852692.png)

User Form

![User Form](images/image-20260204134937663.png)

#### Patient Management

Add new patients and modify patient information. Supports printing medication box labels

Patient Management Interface

![Patient Management](images/image-20260204135040150.png)

> **📌 Label Printing Notes**  
> - Only supported on Windows
> - Install NIIMBOT Print Service SDK from `print_service` directory
> - Connect NIIMBOT label printer via USB
> - Use 50×20mm white label paper

#### Prescription Management

Add and modify patient prescriptions

Prescription Management Interface

![Prescription Management](images/image-20260204135714765.png)

Prescription Form

![Prescription Form](images/image-20260204135844987.png)

#### System Records

Query dispensing records and system operation logs (add, modify, delete patients/users/prescriptions)

Dispensing Records Query

![Dispensing Records](images/image-20260204140012335.png)

Operation Logs Query

![Operation Logs](images/image-20260204140045611.png)

![Operation Details](images/image-20260204140048375.png)

---

### 📱 Dispensing Control APP

#### Pre-Dispensing Setup

1. Prepare medication boxes with patient labels attached
2. Power on the automatic pill dispenser
3. Place the MatePad on the dispenser's counting stand
4. Pair with `PillDispenserXX` device in Bluetooth settings
5. Open the Dispensing Control APP

Pill Dispenser Device

<img src="images/7e6906dbcc70b91b3ee85b1d391a2694.jpg" alt="Pill Dispenser" width="500"/>

APP Icon

![APP Icon](images/Screenshot_20260203_215126_com.huawei.android.launcher.jpg)

#### Home Screen

After prescriptions are entered by doctors, corresponding patient prescription cards appear on the home screen

APP Home Screen

![Home Screen](images/Screenshot_20260203_215159_com.HyggeLab.EasyDosePRO.jpg)

> **💡 Tip**: If prescription cards don't appear, check server URL settings in the app

#### Connect to Dispenser

Tap the button in the upper right corner to connect to the dispenser

Connect to Dispenser

![Connect Dispenser](images/Screenshot_20260203_215237_com.HyggeLab.EasyDosePRO.jpg)

Connection Successful

![Connected](images/Screenshot_20260203_215315_com.HyggeLab.EasyDosePRO-1770185443794.jpg)

> **⚠️ Connection Troubleshooting**  
> - Check "Nearby Devices Access" permission
> - Confirm `PillDispenserXX` is paired in Bluetooth settings

#### Barcode Scanning

Tap a patient card to enter scanning mode. Place the medication box label on the dispenser platform for scanning

Scanning Interface

![Scanning Interface](images/Screenshot_20260203_215331_com.HyggeLab.EasyDosePRO-1770185598555.jpg)

Scanning Medication Box

![Scanning Box](images/be9308cbb0003604f9ff1e2693a01111.jpg)

#### Place Medication Box

After successful recognition, the dispenser track extends with a prompt to insert the medication box

Place Medication Box Prompt

![Place Box](images/Screenshot_20260203_215421_com.HyggeLab.EasyDosePRO.jpg)

> **⚠️ Important**: Make sure the medication box is properly positioned before pressing confirm!

Correct Box Placement

<img src="images/50093bd8e75b28cdd509f50c75b8cd63.jpg" alt="Box Placement" width="400"/>

#### Pill Calibration (First Use)

For new medications, the APP requires placing one pill for size and image data collection

Calibration Interface

![Calibration Required](images/Screenshot_20260203_215738_com.HyggeLab.EasyDosePRO.jpg)

![Calibration Complete](images/Screenshot_20260203_215746_com.HyggeLab.EasyDosePRO.jpg)

#### Dispensing Process

Follow the on-screen instructions to place the appropriate quantity of pills into the dispenser funnel

Dispensing Interface

![Dispensing Interface](images/Screenshot_20260203_215840_com.HyggeLab.EasyDosePRO.jpg)

Adding Pills

<img src="images/6f9e23188ba9da904b9bf3d2f3b216cb.jpg" alt="Adding Pills" width="400"/>

> **💡 Excess Pills**: If more pills are added than needed, excess pills automatically flow to the recovery slot

Recovery Slot

<img src="images/358995d5aca0cd1cb43a9f66091b648f.jpg" alt="Recovery Slot" width="400"/>

#### Error Handling

If a dispensing error occurs, an error dialog appears, the track retracts, and manual correction is required before pressing confirm to continue

Error Prompt

![Error Prompt](images/Screenshot_20260203_215934_com.HyggeLab.EasyDosePRO.jpg)

#### Complete Dispensing

When all medications are dispensed, a completion dialog appears. The track extends for box removal, then retracts after confirmation

Completion Prompt

![Complete Dispensing](images/Screenshot_20260203_220115_com.HyggeLab.EasyDosePRO.jpg)

Remove Medication Box

<img src="images/52864ccd15def351c3610b6b5a1fd415.jpg" alt="Remove Box" width="400"/>

Dispensing Complete

![Process Complete](images/Screenshot_20260203_220148_com.HyggeLab.EasyDosePRO.jpg)

---

## 📁 Project Structure

```text
legacy/v1/
├── client/     # Unity dispensing control application (Windows x64 primary, Android compatible)
├── server/     # Flask + SQLite prescription management and backend service
├── images/     # Documentation images
├── README.md   # V1 documentation (Chinese)
└── README_EN.md # V1 documentation (English)
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Bluetooth connection failed | Verify HC-06 baud rate is 115200, confirm Bluetooth is paired |
| APP cannot discover device | Enable "Nearby Devices Access" permission, ensure Bluetooth is discoverable |
| Server startup failed | Check the port, dependencies, and startup logs in the `EZ_Dose_server` repository |
| Database locked | Close other processes accessing the database |
| Label printing failed | Confirm printer is connected via USB, SDK is properly installed |
| Prescription cards not showing | Check server URL in APP settings |

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

## 📞 Contact

For questions or suggestions, please submit an [Issue](https://github.com/your-username/EZ-Dose/issues)!

---

<p align="center">
  <sub>Made with ❤️ by Jiale Ma</sub>
</p>

