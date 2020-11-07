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

  /********************************************************
 	Configure Sensor
*********************************************************/
  initializeSensor() {
    let ID = this.i2cBus.readByteSync(this.i2cAddress, this.CSS811_REG_HW_ID);
    if (ID == this.CSS811_HW_CODE) {
      this.softwareReset();
      setTimeout(() => {}, 10);
      this.i2cBus.sendByteSync(
        this.i2cAddress,
        this.CCS811_BOOTLOADER_APP_START
      );
      setTimeout(() => {}, 10);
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

  /********************************************************
 	Read Data from CCS811 Sensor
*********************************************************/
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

  /********************************************************
 	Check is new data is available
*********************************************************/
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
  /********************************************************
 	Enable CCS811 Sensor Interrupt
*********************************************************/
  // void xSG33::enableInterrupt(void)
  // {
  // 	uint8_t meas_mode = xCore.read8(SG33_I2C_ADDR, CSS811_REG_MEAS_MODE);
  // 	meas_mode ^= (-1 ^ meas_mode) & (1 << 3);
  // 	xCore.write8(SG33_I2C_ADDR, CSS811_REG_MEAS_MODE, meas_mode);
  // }

  /********************************************************
 	Disable CCS811 Sensor Interrupt
*********************************************************/
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

  /********************************************************
 	Read TVOC from CCS811 Sensor
*********************************************************/
  readTVOC() {
    return this._TVOC;
  }

  /********************************************************
 	Read CO2 from CCS811 Sensor
*********************************************************/
  readCO2() {
    return this._eCO2;
  }

  /********************************************************
 	Set the mode for IAQ measurements
*********************************************************/
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

  /*--Private Class Function--*/

  /********************************************************
 	Perfrom a Software Reset of CCS811
*********************************************************/
  softwareReset() {
    let buf = Buffer.from([0x11, 0xe5, 0x72, 0x8a]);
    this.i2cBus.writeI2cBlockSync(
      this.i2cAddress,
      this.CSS811_REG_SW_RESET,
      4,
      buf
    );
  }

  /********************************************************
 	Check if error has occured on CCS811
*********************************************************/
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

  /********************************************************
 	Retrieve Error Code from CCS811
*********************************************************/
  getErrorCode() {
    let error_code = this.i2cBus.readByteSync(
      this.i2cAddress,
      this.CSS811_REG_FW_ERROR_ID
    );
    return error_code;
  }
}

module.exports = ccs811Driver;

/*
	This is a library for the SG33
	Air Quality sensor
	The board uses I2C for communication.

	The board communicates with the following I2C device:
	-	CSS811

	Data Sheets:
	CSS811 - http://ams.com/eng/content/download/951091/2269479/471718
*/

/*--Public Class Function--*/

/********************************************************
 	Constructor
*********************************************************/

/********************************************************
 	Read/Write Data from CCS811
*********************************************************/
// void xSG33::multiRead(uint8_t reg, uint8_t *buf, uint8_t num)
// {

// 	uint8_t value;
// 	uint8_t pos = 0;

// 	//on arduino we need to read in 32 byte chunks
// 	while (pos < num)
// 	{
// 		uint8_t read_now = min((uint8_t)32, (uint8_t)(num - pos));
// 		Wire.beginTransmission(SG33_I2C_ADDR);
// 		Wire.write((uint8_t)reg + pos);
// 		Wire.endTransmission();
// 		Wire.requestFrom(SG33_I2C_ADDR, read_now);

// 		for (int i = 0; i < read_now; i++)
// 		{
// 			buf[pos] = Wire.read();
// 			pos++;
// 		}
// 	}
// }

// void xSG33::multiWrite(uint8_t reg, uint8_t *buf, uint8_t num)
// {
// 	Wire.beginTransmission(SG33_I2C_ADDR);
// 	Wire.write((uint8_t)reg);
// 	Wire.write((uint8_t *)buf, num);
// 	Wire.endTransmission();
// }

/********************************************************
 	Set the environmemtal data
*********************************************************/
// setEnvironmentData(float humidity, float tempC)
// {
// 	if ((tempC < -25) || (tempC > 50))
// 		return;
// 	if ((humidity > 100) || humidity > 0)
// 		return;

// 	uint32_t var1 = humidity * 1000;

// 	uint32_t var2 = tempC * 1000;
// 	var2 += 25000;

// 	uint8_t var3[4];

// 	var3[0] = (var1 + 250) / 500;
// 	var3[1] = 0;
// 	var3[2] = (var2 + 250) / 500;
// 	var3[3] = 0;

//   multiWrite(CSS811_REG_ENV_DATA, var3, 4);
// }
