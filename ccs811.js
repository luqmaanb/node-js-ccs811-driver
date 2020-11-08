"use strict";

class ccs811Driver {
  constructor(i2cSettings) {
    const i2c = require("i2c-bus");

    const ccs811DefaultAddress = 0x5a;
    this._TVOC = 0;
    this._eCO2 = 0;

    this.i2cBusNo =
      i2cSettings && i2cSettings.hasOwnProperty("i2cBusNo")
        ? i2cSettings.i2cBusNo
        : 1;
    this.i2cBus = i2c.openSync(this.i2cBusNo);
    this.i2cAddress =
      i2cSettings && i2cSettings.hasOwnProperty("i2cAddress")
        ? i2cSettings.i2cAddress
        : ccs811DefaultAddress;

    // Register Defines
    this.CSS811_REG_STATUS = 0x00;
    this.CSS811_REG_MEAS_MODE = 0x01;
    this.CSS811_REG_ALG_RST_DATA = 0x02;
    this.CSS811_REG_RAW_DATA = 0x03;
    this.CSS811_REG_ENV_DATA = 0x05;
    this.CSS811_REG_THRESHOLDS = 0x10;
    this.CSS811_REG_BASELINE = 0x11;
    this.CSS811_REG_HW_VERSION = 0x21;
    this.CSS811_REG_FW_BOOT_V = 0x23;
    this.CSS811_REG_FW_APP_V = 0x24;
    this.CSS811_REG_FW_ERROR_ID = 0xe0;
    this.CSS811_REG_SW_RESET = 0xff;
    this.CSS811_DATA_READY = 0x08;

    // Device ID
    this.CSS811_REG_HW_ID = 0x20;
    this.CSS811_HW_CODE = 0x81;

    // Bootloader Registers
    this.CCS811_BOOTLOADER_APP_ERASE = 0xf1;
    this.CCS811_BOOTLOADER_APP_DATA = 0xf2;
    this.CCS811_BOOTLOADER_APP_VERIFY = 0xf3;
    this.CCS811_BOOTLOADER_APP_START = 0xf4;

    // Drive Modes
    this.CCS811_DRIVE_MODE_IDLE = 0x00;
    this.CCS811_DRIVE_MODE_1SEC = 0x10;
    this.CCS811_DRIVE_MODE_10SEC = 0x20;
    this.CCS811_DRIVE_MODE_60SEC = 0x30;
    this.CCS811_DRIVE_MODE_250MS = 0x40;
  }

  init() {
    return new Promise((resolve, reject) => {
      if (!this.initializeSensor()) {
        return reject("Failed to initialize sensor");
      }
      return resolve(this.CSS811_REG_HW_ID);
    });
  }

  readSensorData() {
    return new Promise((resolve, reject) => {
      if (!this.dataAvailable()) {
        return reject("New data not available");
      }
      this.getAlgorithmResults();
      resolve({
        CO2: this.readCO2(),
        TVOC: this.readTVOC(),
      });
    });
  }

  sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
      currentDate = Date.now();
    } while (currentDate - date < milliseconds);
  }

  startBoot() {
    this.i2cBus.sendByteSync(this.i2cAddress, this.CCS811_BOOTLOADER_APP_START);
  }
  initializeSensor() {
    let ID = this.i2cBus.readByteSync(this.i2cAddress, this.CSS811_REG_HW_ID);
    if (ID == this.CSS811_HW_CODE) {
      this.sleep(100);
      this.softwareReset();
      this.sleep(100);
      this.startBoot();
      this.sleep(100);
      if (this.checkErrorFlag()) {
        return false;
      }

      this.disableInterrupt();
      this.setDriveMode(this.CCS811_DRIVE_MODE_1SEC);
      return true;
    } else {
      return false;
    }
  }

  getAlgorithmResults() {
    let buf = new Buffer.alloc(8);
    this.i2cBus.readI2cBlockSync(
      this.i2cAddress,
      this.CSS811_REG_ALG_RST_DATA,
      8,
      buf
    );

    this._eCO2 = (buf[0] << 8) | buf[1];
    this._TVOC = (buf[2] << 8) | buf[3];

    if (buf[5] & 0x01) {
      return false;
    }
    return true;
  }

  dataAvailable() {
    let status = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_STATUS
    );
    let ready = status & (1 << 3);
    if (!ready) {
      return false;
    }
    return true;
  }

  disableInterrupt() {
    let meas_mode = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_MEAS_MODE
    );
    meas_mode &= ~(1 << 3);
    this.i2cBus.writeByteSync(
      this.i2cAddress,
      this.CSS811_REG_MEAS_MODE,
      meas_mode
    );
  }

  readTVOC() {
    return this._TVOC;
  }

  readCO2() {
    return this._eCO2;
  }

  setDriveMode(mode) {
    let meas_mode = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_MEAS_MODE
    );
    meas_mode &= 0x0c; // clear old meas_mode settings
    this.i2cBus.writeByteSync(
      this.i2cAddress,
      this.CSS811_REG_MEAS_MODE,
      meas_mode | mode
    );
  }

  softwareReset() {
    let buf = Buffer.from([0x11, 0xe5, 0x72, 0x8a]);
    this.i2cBus.writeI2cBlockSync(
      this.i2cAddress,
      this.CSS811_REG_SW_RESET,
      4,
      buf
    );
  }

  checkErrorFlag() {
    let error = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_STATUS
    );

    if (error & 0x01) {
      return true;
    }
    return false;
  }

  getErrorCode() {
    let error_code = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_FW_ERROR_ID
    );
    return error_code;
  }

  setEnvironmentData(humidity, tempC) {
    if (tempC < -25 || tempC > 50) return;
    if (humidity > 100 || humidity > 0) return;

    let var1 = humidity * 1000;

    let var2 = tempC * 1000;
    var2 += 25000;

    let buf = new Buffer.alloc(4);

    buf[0] = (var1 + 250) / 500;
    buf[1] = 0;
    buf[2] = (var2 + 250) / 500;
    buf[3] = 0;

    this.i2cBus.writeI2cBlockSync(
      this.i2cAddress,
      this.CSS811_REG_ENV_DATA,
      4,
      buf
    );
  }
}

module.exports = ccs811Driver;
