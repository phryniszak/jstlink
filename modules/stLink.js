/*!
 * Copyright(c) 2021 Pawel Hryniszak
 */

import { sendCommand, STLinkException } from "./stLinkDrv.js";
import { STATUS, MODES, STM32MCU, TDeviceRequest, JTAGFrequencies, SWDFrequencies } from "./stLinkConst.js";

// https://github.com/visionmedia/debug
// localStorage.debug = 'stlink:*'
const logger = debug("stlink:link");
const JLINK_MAX_SIZE = 256; // 4096; // 6144;

const defs = {

    // ST-Link GET VERSION command
    CMD_GET_VERSION: 0xf1,
    CMD_GET_VERSION_EXT: 0xfb,

    // ST-Link GET CURRENT MODE command
    CMD_GET_CURRENT_MODE: 0xf5,
    // GET CURRENT MODE returned values
    //  DEV_DFU_MODE: 0x00,
    //  DEV_MASS_MODE: 0x01,
    //  DEV_JTAG_MODE: 0x02,
    //  DEV_SWIM_MODE: 0x03,
    //  DEV_BTLD_MODE: 0x04,

    // ST-Link DFU command
    CMD_DFU: 0xf3,
    // DFU sub-command
    DFU_EXIT: 0x07,

    // ST-Link JTAG command
    CMD_JTAG: 0xf2,

    // JTAG sub-commands + parameters
    JTAG_ENTER2: 0x30, // to enter JTAG/SWD with new API
    JTAG_ENTER_SWD: 0xa3,
    JTAG_ENTER_JTAG_NO_CORE_RESET: 0xa4,
    JTAG_AP_NO_CORE: 0,
    JTAG_AP_CORTEXM_CORE: 1,
    JTAG_EXIT: 0x21,

    JTAG_READ_IDCODES: 0x31, // New in API2

    JTAG_DRIVE_NRST: 0x3c,
    // Parameters for JTAG_DRIVE_NRST.
    JTAG_DRIVE_NRST_LOW: 0x00,
    JTAG_DRIVE_NRST_HIGH: 0x01,
    JTAG_DRIVE_NRST_PULSE: 0x02,

    JTAG_READMEM_32BIT: 0x07,
    JTAG_READMEM_16BIT: 0x47, // New in ST-Link/V2 from version J26
    JTAG_READMEM_8BIT: 0x0c,
    JTAG_WRITEMEM_8BIT: 0x0d,
    JTAG_GETLASTRWSTATUS2: 0x3e, // Added in V2J15
    JTAG_WRITEMEM_32BIT: 0x08,

    SWV_START_TRACE_RECEPTION: 0x40,
    SWV_STOP_TRACE_RECEPTION: 0x41,
    SWV_GET_TRACE_NEW_RECORD_NB: 0x42,

    SWD_SET_FREQ: 0x43, // New in ST-Link/V2 from version J20
    JTAG_SET_FREQ: 0x44, // New in ST-Link/V2 from version J24
    JTAG_BLINK_LED: 0x49, // New in ST-Link/V2 from version J28
    JTAG_INIT_AP: 0x4b, // New in ST-Link/V2 from version J28
    JTAG_CLOSE_AP_DBG: 0x4c, // New in ST-Link/V2 from version J28
    JTAG_SET_COM_FREQ: 0x61, // New in ST-Link/V3
    JTAG_GET_COM_FREQ: 0x62, // New in ST-Link/V3

    JTAG_GET_TARGET_VOLTAGE: 0xf7
};

const STM32Add = {
    STM32_DBGMCU_IDCODE_ADDR: 0xe0042000,
    STM32_DBGMCU_ADDR: 0x40015800,
    STM32H_IDCODE_ADDR: 0x5c001000,
    STM32W_IDCODE_ADDR: 0x40004000,
    STM32L5_IDCODE_ADDR: 0xe0044000
};

const ACCESS_POINT_ID = 0;

let JTAGV3Frequencies = {};
let SWDV3Frequencies = {};
let JTAGV3CurrentFreq = {};
let SWDV3CurrentFreq = {};

/**
 * Gets the versions of specified device for ST-Link v3.
 *
 * @returns {object} - Result of the command and versions of ST-LINK, JTAG and SWIM.
 */
const getVersionExt = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_GET_VERSION_EXT;
    req.cmd_ui8arr[1] = 0x00;
    req.in_length = 12;

    let drvResult = await sendCommand(req);

    // GET_VERSION_EXT response structure(byte offsets):
    //   0: HW version
    //   1: SWIM version
    //   2: JTAG / SWD version
    //   3: MSC / VCP version
    //   4: Bridge version
    //   5 - 7: reserved
    //   8 - 9: ST_VID
    //   10 - 11:  PID
    let STLinkVersion = req.in.getUint16(0, true);
    let SWIMVersion = req.in.getUint8(1);
    let JTAGVersion = req.in.getUint8(2);

    return {
        result: drvResult,
        STLinkVersion: STLinkVersion,
        JTAGVersion: JTAGVersion,
        SWIMVersion: SWIMVersion
    };
};

/**
 * Gets the versions of the specified device.
 *
 * @returns {object} - Result of the command and versions of ST-LINK, JTAG and SWIM.
 */
const getVersion = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_GET_VERSION;
    req.cmd_ui8arr[1] = 0x00;
    req.in_length = 6;

    let drvResult = await sendCommand(req);

    // GET_VERSION response structure:
    //   Byte 0-1:
    //     [15:12] Major/HW version
    //     [11:6]  JTAG/SWD version
    //     [5:0]   SWIM or MSC version
    //   Byte 2-3: ST_VID
    //   Byte 4-5:  PID
    let STLinkVersion = (req.in.getUint8(0) >> 4) & 0x0f; // 4 MSB of first byte
    let JTAGVersion = ((req.in.getUint8(0) << 2) & 0x3c) | ((req.in.getUint8(1) >> 6) & 0x03); // 4 LSB of first byte + 2 MSB of second byte
    let SWIMVersion = req.in.getUint8(1) & 0x3f; // 6 LSB of second byte


    // ST-Link/V3 versions must be retrieved using ST_GetVersionExt()
    if (STLinkVersion >= 3) {
        return getVersionExt();
    }

    return {
        result: drvResult,
        STLinkVersion: STLinkVersion,
        JTAGVersion: JTAGVersion,
        SWIMVersion: SWIMVersion
    };
};

/**
 * Gets the mode on which the link is configured can be:
 * JTAG(0x02), SWIM(0x03), MASS STORAGE(0x01) or DFU(0x00).
 *
 * @returns {object} - Result of the commands and if OK the mode and if DFU, it version.
 */
const getCurrentMode = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_GET_CURRENT_MODE;
    req.cmd_ui8arr[1] = 0x00;
    req.in_length = 2;

    let drvResult = await sendCommand(req);

    // actual mode byte is the LSB of this LE-u16
    let mode = req.in.getUint16(0, true);

    let DFUVersion = 0;

    // if mode is DFU, DFU version is in MSB of this LE-u16
    if (mode == MODES.DEV_DFU_MODE) {
        DFUVersion = req.in.getUint16(1, true);
    }

    return {
        result: drvResult,
        mode: mode,
        modeStr: modeString(mode),
        DFUVersion: DFUVersion
    };
};

/**
 * Internal - Retrieves mode string from given mode.
 *
 * @param {number} mode - Mode Id.
 * @returns {string} - String mode or empty.
 */
const modeString = (mode) => {
    const map = {
        [MODES.DEV_DFU_MODE]: "DFU",
        [MODES.DEV_MASS_MODE]: "MASS/IDLE",
        [MODES.DEV_JTAG_MODE]: "JTAG",
        [MODES.DEV_SWIM_MODE]: "SWIM",
        [MODES.DEV_BTLD_MODE]: "BTLD"
    };
    return map[mode] || "";
};


/**
 * Exit the DFU mode for hte specified device.
 *
 * @returns {number} - Result of the command.
 */
const exitDFUMode = async () => {
    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_DFU;
    req.cmd_ui8arr[1] = defs.DFU_EXIT;

    await sendCommand(req);
};

///////////////////////////////////////////////////////////////////////////////
// JTAG interface

/**
 * Closes Access point on specified device.
 *
 * @param {number} accessPointId - Access point index.
 * @returns {number} - Result od the command.
 */
const closeAccessPoint = async (accessPointId) => {

    let req = new TDeviceRequest();
    req.cmd_length = 3;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_CLOSE_AP_DBG;
    req.cmd_ui8arr[2] = accessPointId;
    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("closeAccessPoint error", JTAGstatus);
    }
};

/**
 * Initializes access point for specified device.
 *
 * @param {number} accessPointId - Access point index.
 * @returns {number} - Result od the command.
 */
const initAccessPoint = async (accessPointId) => {
    let req = new TDeviceRequest();
    req.cmd_length = 4;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_INIT_AP;
    req.cmd_ui8arr[2] = accessPointId;
    req.cmd_ui8arr[3] = defs.JTAG_AP_CORTEXM_CORE;
    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("initAccessPoint error", JTAGstatus);
    }
};

/**
 *
 * @param {object} deviceDesc - Device descriptor.
 */
const enterJTAG = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 4;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_ENTER2;
    req.cmd_ui8arr[2] = defs.JTAG_ENTER_JTAG_NO_CORE_RESET;
    req.cmd_ui8arr[3] = ACCESS_POINT_ID;
    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("enterJTAG error", JTAGstatus);
    }
};

/**
 * Enter SWD mode for given device.
 *
 * @param {object} deviceDesc - Device descriptor.
 * @param {string} typeConnect - The connection protocol either p2p or tcp.
 * @returns {number} - Result of the commands.
 */
const enterSWD = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 4;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_ENTER2;
    req.cmd_ui8arr[2] = defs.JTAG_ENTER_SWD;
    req.cmd_ui8arr[3] = ACCESS_POINT_ID;
    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian // req.in.getUint16(0, true)
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("enterSWD error", JTAGstatus);
    }
};

/**
 * Exit JTAG mode for given device.
 *
 * @returns {number} - Result of the commands.
 */
const exitJTAG = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_EXIT;

    await sendCommand(req);
};

/**
 * Reads code Id for a given device.
 *
 * @returns {object} - Result of the command and Id of the MCU.
 */
const JTAG_ReadIdCodes = async () => {

    const CORTEX_DESIGNER_ARM_ID = 0x477;

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_READ_IDCODES;
    req.in_length = 12;

    await sendCommand(req);

    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("JTAG_ReadIdCodes", JTAGstatus);
    }

    let mcuid = 0x000;

    let cortexID = req.in.getUint32(4, true);

    // First check the DESIGNER ID from cortexIdcode
    if ((cortexID & 0x00000fff) != CORTEX_DESIGNER_ARM_ID) {
        logger("Device not supported");
        throw new STLinkException("JTAG_ReadIdCodes error", STATUS.DEVICE_NOT_SUPPORTED);
    }

    // Then find STM32 MCU code from specific target memory regions
    for (const address in STM32Add) {
        if (mcuid == 0x000) {
            let data = await JTAG_ReadMemory32Bit(STM32Add[address], 4);
            mcuid = STM32Add[address] != STM32Add.STM32W_IDCODE_ADDR
                ? data.getUint32(0, true) & 0x00000fff
                : (data.getUint32(0, true) >> 12) & 0x00000fff;

        }
    }

    // return found MCUID, or 0x000 if nothing found after all trials
    logger("mcuid = ", mcuid);
    return mcuid;
};

/**
 * Gets the MCU name according to it Id.
 *
 * @param {number} mcuid - Id of the MCU.
 * @returns {string} - MCU String.
 */
function getSTM32MCUString(mcuid) {
    let MCUString = STM32MCU[mcuid];

    if (MCUString != undefined) {
        return MCUString;
    } else {
        return "Unknown MCU";
    }
}

/**
 * Returns the list of possible JTAG frequencies.
 */
function getJTAGFrequencies() {
    return Object.keys(JTAGFrequencies);
}

/**
 * Returns the list of possible SWD frequencies.
 */
function getSWDFrequencies() {
    return Object.keys(SWDFrequencies);
}

/**
 * Returns the list of supported SWD frequencies for a ST-LINK V3.
 */
function v3getSWDFrequencies() {
    return Object.keys(SWDV3Frequencies);
}

/**
 * Returns the list of supported JTAG frequencies for a ST-LINK V3.
 */
function v3getJTAGFrequencies() {
    return Object.keys(JTAGV3Frequencies);
}

/**
 * Fill supported frequencies for given protocol.
 *
 * @param {*} DataView - DataView with read frequencies.
 * @param {string} protocol - The connection mode either JTAG or SWD.
 */
const fillSupportedFreq = (in_view, protocol) => {

    let nbfreq = in_view.getUint32(8, true);
    let freqValue;

    if (protocol == "JTAG") {
        JTAGV3CurrentFreq = in_view.getUint32(4, true);
    } else {
        SWDV3CurrentFreq = in_view.getUint32(4, true);
    }

    for (let i = 0; i < nbfreq; i++) {

        freqValue = in_view.getUint32(12 + 4 * i, true);
        if (protocol == "JTAG") {
            JTAGV3Frequencies[freqValue + " kHz"] = freqValue;
        } else {
            SWDV3Frequencies[freqValue + " kHz"] = freqValue;
        }
    }
};

/**
 * Gets supported target frequencies for a given ST-LINK V3 device.
 * V3 only, replaces SWD/JTAG_GET_FREQ
 *
 * @param {string} protocol - The connection mode either JTAG or SWD.
 * @returns {number} - Result of the command.
 */
const JTAG_GetComFrequency = async (protocol) => {

    let req = new TDeviceRequest();
    req.cmd_length = 3;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_GET_COM_FREQ;
    req.cmd_ui8arr[2] = protocol == "JTAG" ? 1 : 0;
    req.in_length = 52;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("JTAG_GetComFrequency error", JTAGstatus);
    }

    fillSupportedFreq(req.in, protocol);
};

/**
 * Set the JTAG frequency for a given device.
 *
 * @param {string} frequency - The frequency to set.
 * @returns {number} - The result of the command.
 */
const JTAG_SetJTAGFrequency = async (frequency) => {

    // check if protocol is supported

    // check if frequency is valid
    let newFreq;
    if (frequency == "default") {
        newFreq = JTAGFrequencies["1.12 MHz - Default"];
    } else {
        newFreq = JTAGFrequencies[frequency];
        if (newFreq == undefined) {
            logger(`JTAG frequency requested not supported : ${frequency}kHz`);
            throw new STLinkException(`JTAG frequency requested not supported : ${frequency}kHz`,
                STATUS.JTAG_FREQUENCY_NOT_SUPPORTED);
        }
    }

    // send command
    let req = new TDeviceRequest();
    req.cmd_length = 4;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_SET_FREQ;
    req.cmd_ui8arr[2] = newFreq & 0xff;
    req.cmd_ui8arr[3] = (newFreq >> 8) & 0xff;

    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("JTAG_SetJTAGFrequency error", JTAGstatus);
    }
};

/**
 * Set the SWD frequency for a given device.
 *
 * @param {string} frequency - The frequency to set.
 * @returns {number} - The result of the command.
 */
const JTAG_SetSWDFrequency = async (frequency) => {

    // check if protocol is supported

    // check if frequency is valid
    let newFreq;
    if (frequency == "default") {
        newFreq = SWDFrequencies["1.8 MHz - Default"];
    } else {
        newFreq = SWDFrequencies[frequency];
        if (newFreq == undefined) {
            logger(`SWD frequency requested not supported : ${frequency}kHz`);
            throw new STLinkException(`SWD frequency requested not supported : ${frequency}kHz`,
                STATUS.SWD_FREQUENCY_NOT_SUPPORTED);
        }
    }

    // send command
    let req = new TDeviceRequest();
    req.cmd_length = 4;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.SWD_SET_FREQ;
    req.cmd_ui8arr[2] = newFreq & 0xff;
    req.cmd_ui8arr[3] = (newFreq >> 8) & 0xff;
    req.in_length = 2;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("JTAG_SetSWDFrequency error", JTAGstatus);
    }
};

/**
 * Sets the STLINK V3 frequency for a given device on specified mode.
 * V3 only, replaces SWD/JTAG_SET_FREQ
 *
 * @param {string} protocol - The connection mode either JTAG or SWD.
 * @param {string} frequency - The frequency to set.
 */
const JTAG_SetComFrequency = async (protocol, frequency) => {

    // check if frequency is valid
    let newFreq;
    if (protocol == "JTAG") {
        newFreq = frequency == "default" ? JTAGV3CurrentFreq : JTAGV3Frequencies[frequency];
    } else {
        newFreq = frequency == "default" ? SWDV3CurrentFreq : SWDV3Frequencies[frequency];
    }

    if (newFreq == undefined) {
        logger(`Frequency requested not supported : ${frequency}kHz`);
        throw new STLinkException(`Frequency requested not supported : ${frequency}kHz`,
            STATUS.FREQUENCY_NOT_SUPPORTED);
    }

    // send command
    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_SET_COM_FREQ;
    req.cmd_ui8arr[2] = protocol == "JTAG" ? 1 : 0;
    req.cmd_ui8arr[3] = 0;
    req.cmd_ui8arr[4] = newFreq & 0xff;
    req.cmd_ui8arr[5] = (newFreq >> 8) & 0xff;
    req.cmd_ui8arr[6] = (newFreq >> 16) & 0xff;
    req.cmd_ui8arr[7] = (newFreq >> 24) & 0xff;
    req.in_length = 8;

    await sendCommand(req);

    // JTAG response is an u16 in Little Endian
    let JTAGstatus = req.in.getUint16(0, true);
    if (JTAGstatus !== STATUS.OK) {
        throw new STLinkException("JTAG_SetComFrequency error", JTAGstatus);
    }
};

/**
 * Read 32 bit aligned buffer of specified size at provided address in device.
 *
 * @param {number} address - Address where to write.
 * @param {number} size - Size to read.
 * @returns {object} - Result of the command, size and data read.
 */
const JTAG_ReadMemory32Bit = async (address, size) => {

    // size must not be <= 0 or > 6144 for 32-bit accesses
    if (size <= 0 || size > JLINK_MAX_SIZE) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        logger("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        throw new STLinkException(`size and address must be 4-bytes aligned (32-bit access): ${size} : ${address}`, STATUS.BAD_PARAMETER);
    }

    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_READMEM_32BIT;
    req.cmd_ui8arr[2] = address & 0xff;
    req.cmd_ui8arr[3] = (address >> 8) & 0xff;
    req.cmd_ui8arr[4] = (address >> 16) & 0xff;
    req.cmd_ui8arr[5] = (address >> 24) & 0xff;
    req.cmd_ui8arr[6] = size & 0xff;
    req.cmd_ui8arr[7] = (size >> 8) & 0xff;
    req.cmd_ui8arr[8] = ACCESS_POINT_ID;
    req.in_length = size;

    await sendCommand(req);

    await GetLastReadWriteStatus();

    // return the buffer read out from target
    return req.in;
};

/**
 * Read 16 bit aligned buffer of specified size at provided address in device.
 *
 * @param {number} address - Address where to write.
 * @param {number} size - Size to read.
 * @returns {object} - Result of the command, size and data read.
 */
const JTAG_ReadMemory16Bit = async (address, size) => {

    // size must not be <= 0 or > 6144 for 32-bit accesses
    if (size <= 0 || size > JLINK_MAX_SIZE) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    // size and address must be 2-bytes aligned (16-bit access)
    if (size % 2 != 0 || address % 2 != 0) {
        logger("size and address must be 2-bytes aligned (16-bit access) : ", size, " ", address);
        throw new STLinkException(`size and address must be 2-bytes aligned (16-bit access): ${size} : ${address}`, STATUS.BAD_PARAMETER);
    }

    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_READMEM_16BIT;
    req.cmd_ui8arr[2] = address & 0xff;
    req.cmd_ui8arr[3] = (address >> 8) & 0xff;
    req.cmd_ui8arr[4] = (address >> 16) & 0xff;
    req.cmd_ui8arr[5] = (address >> 24) & 0xff;
    req.cmd_ui8arr[6] = size & 0xff;
    req.cmd_ui8arr[7] = (size >> 8) & 0xff;
    req.cmd_ui8arr[8] = ACCESS_POINT_ID;
    req.in_length = size;

    await sendCommand(req);

    await GetLastReadWriteStatus();


    // return the buffer read out from target
    return req.in;
};

/**
 * Read 8 bit aligned buffer of specified size at provided address in device.
 *
 * @param {number} address - Address where to write.
 * @param {number} size - Size to read.
 * @returns {object} - Result of the command, size and data read.
 */
const JTAG_ReadMemory8Bit = async (address, size) => {

    // size must not be <= 0 or > 64 for 8-bit accesses
    /* max 8 bit read/write is 64 bytes or 512 bytes for v3 */
    if (size <= 0 || size > 64) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_READMEM_8BIT;
    req.cmd_ui8arr[2] = address & 0xff;
    req.cmd_ui8arr[3] = (address >> 8) & 0xff;
    req.cmd_ui8arr[4] = (address >> 16) & 0xff;
    req.cmd_ui8arr[5] = (address >> 24) & 0xff;
    req.cmd_ui8arr[6] = size & 0xff;
    req.cmd_ui8arr[7] = (size >> 8) & 0xff;
    req.cmd_ui8arr[8] = ACCESS_POINT_ID;

    // minimum two bytes are read
    if (size == 1) {
        req.in_length = 2;
        req.in_length_ex = 1;
    } else {
        req.in_length = size;
    }

    await sendCommand(req);

    await GetLastReadWriteStatus();

    // return the buffer read out from target
    return req.in;
};


/**
 * Writes 32 bit aligned buffer of specified size at provided address in device.
 *
 * @param {number} address - Address where to write.
 * @param {number} size - Size of the buffer.
 * @param {ArrayBuffer} buffer - Data to write.
 */
const JTAG_WriteMemory32Bit = async (address, size, buffer) => {

    // size must not be <= 0 or > 6144 for 32-bit accesses
    if (size <= 0 || size > JLINK_MAX_SIZE) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        logger("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        throw new STLinkException(`size and address must be 4-bytes aligned (32-bit access): ${size} : ${address}`, STATUS.BAD_PARAMETER);
    }

    if (buffer.byteLength <= 0 || size > buffer.byteLength) {
        logger("buffer size n not in the range : ", buffer.byteLength);
        throw new STLinkException(`buffer size n not in the range: ${buffer.byteLength}`, STATUS.BAD_PARAMETER);
    }

    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_WRITEMEM_32BIT;
    req.cmd_ui8arr[2] = address & 0xff;
    req.cmd_ui8arr[3] = (address >> 8) & 0xff;
    req.cmd_ui8arr[4] = (address >> 16) & 0xff;
    req.cmd_ui8arr[5] = (address >> 24) & 0xff;
    req.cmd_ui8arr[6] = size & 0xff;
    req.cmd_ui8arr[7] = (size >> 8) & 0xff;
    req.cmd_ui8arr[8] = ACCESS_POINT_ID;
    req.out_length = size;

    // is it bug? sometimes when I pass bigger buffer when requested to write its hangs?
    if (buffer.byteLength == size) {
        req.out = buffer;
    } else {
        req.out = buffer.slice(0, size);
    }

    await sendCommand(req);

    await GetLastReadWriteStatus();
};

/**
 * Writes 8 bit aligned buffer of specified size at provided address in device.
 *
 * @param {number} address - Address where to write.
 * @param {number} size - Size of the buffer.
 * @param {ArrayBuffer} buffer - Data to write.
 */
const JTAG_WriteMemory8Bit = async (address, size, buffer) => {

    // org: size must not be <= 0 or > 6144 for 32-bit accesses - BUG?
    // size must not be <= 0 or > 64 for 8-bit accesses
    /* max 8 bit read/write is 64 bytes or 512 bytes for v3 */
    if (size <= 0 || size > 64) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    if (buffer.byteLength <= 0 || size > buffer.byteLength) {
        logger("buffer size n not in the range : ", buffer.byteLength);
        throw new STLinkException(`buffer size n not in the range: ${buffer.byteLength}`, STATUS.BAD_PARAMETER);
    }

    let req = new TDeviceRequest();
    req.cmd_length = 10;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_WRITEMEM_8BIT;
    req.cmd_ui8arr[2] = address & 0xff;
    req.cmd_ui8arr[3] = (address >> 8) & 0xff;
    req.cmd_ui8arr[4] = (address >> 16) & 0xff;
    req.cmd_ui8arr[5] = (address >> 24) & 0xff;
    req.cmd_ui8arr[6] = size & 0xff;
    req.cmd_ui8arr[7] = (size >> 8) & 0xff;
    req.cmd_ui8arr[8] = ACCESS_POINT_ID;
    req.out_length = size;

    // is it bug? sometimes when I pass bigger buffer when requested to write its hangs?
    if (buffer.byteLength == size) {
        req.out = buffer;
    } else {
        req.out = buffer.slice(0, size);
    }

    await sendCommand(req);

    await GetLastReadWriteStatus();
};

///////////////////////////////////////////////////////////////////////////////
// SWV

/*
    def swo_start(self, baudrate):
        with self._lock:
            bufferSize = 4096
            cmd = [Commands.JTAG_COMMAND, Commands.SWV_START_TRACE_RECEPTION]
            cmd.extend(six.iterbytes(struct.pack('<HI', bufferSize, baudrate)))
            response = self._device.transfer(cmd, readSize=2)
            self._check_status(response)

    def swo_stop(self):
        with self._lock:
            cmd = [Commands.JTAG_COMMAND, Commands.SWV_STOP_TRACE_RECEPTION]
            response = self._device.transfer(cmd, readSize=2)
            self._check_status(response)

    def swo_read(self):
        with self._lock:
            response = None
            bytesAvailable = None
            try:
                cmd = [Commands.JTAG_COMMAND, Commands.SWV_GET_TRACE_NEW_RECORD_NB]
                response = self._device.transfer(cmd, readSize=2)
                bytesAvailable, = struct.unpack('<H', response)
                if bytesAvailable:
                    return self._device.read_swv(bytesAvailable)
                else:
                    return bytearray()
            except KeyboardInterrupt:
                # If we're interrupted after sending the SWV_GET_TRACE_NEW_RECORD_NB command,
                # we have to read the queued SWV data before any other commands can be sent.
                if response is not None:
                    if bytesAvailable is None:
                        bytesAvailable, = struct.unpack('<H', response)
                    if bytesAvailable:
                        self._device.read_swv(bytesAvailable)
*/

///////////////////////////////////////////////////////////////////////////////
// other

/**
 * Blink led.
 *
 * @returns {string} Result of the command.
 */
const blinkLed = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 2;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_BLINK_LED;
    req.in_length = 2;

    await sendCommand(req);
};

///////////////////////////////////////////////////////////////////////////////
// private

/**
 *  Get status of the last read or write command on given device.
 *
 * @returns {object} - Result of the command.
 */
const GetLastReadWriteStatus = async () => {

    let req = new TDeviceRequest();
    req.cmd_length = 16;
    req.cmd_ui8arr[0] = defs.CMD_JTAG;
    req.cmd_ui8arr[1] = defs.JTAG_GETLASTRWSTATUS2;
    req.cmd_ui8arr[2] = ACCESS_POINT_ID;
    req.in_length = 12;

    await sendCommand(req);

    let JTAGstatus = req.in.getUint16(0, true);

    if (JTAGstatus !== STATUS.OK) {
        // erroneous address is in the second 32-bit answer
        let badaddress = req.in.getUint32(4, true);
        logger("Bad address : ", badaddress);
        throw new STLinkException(`GetLastReadWriteStatus error: bad addess 0x${badaddress.toString(16)}`, JTAGstatus);
    }
};

/**
 * Creates a new ArrayBuffer from concatenating two existing ones
 * https://gist.github.com/72lions/4528834
 *
 * @param {ArrayBuffer | null} buffer1 The first buffer.
 * @param {ArrayBuffer | null} buffer2 The second buffer.
 * @return {ArrayBuffer | null} The new ArrayBuffer created out of the two.
 */
const concatArrayBuffers = function (buffer1, buffer2) {

    if (!buffer1) {
        return buffer2;
    } else if (!buffer2) {
        return buffer1;
    }

    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(new Uint8Array(buffer1), 0);
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
    return tmp.buffer;
};

///////////////////////////////////////////////////////////////////////////////
// extensions to JLINK native functions

const JTAG_ReadMemory32Bit_ex = async (address, size) => {

    if (size <= 0 || size >= 0xffffffff) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        logger("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        throw new STLinkException(`size and address must be 4-bytes aligned (32-bit access): ${size} : ${address}`, STATUS.BAD_PARAMETER);
    }

    let addressToRead = address;
    let remainingBytes = size;
    let data = null;

    while (remainingBytes > 0) {

        let bytesToRead = Math.min(JLINK_MAX_SIZE, remainingBytes);

        // read requested bytes in 32-bit mode
        let read32data = await JTAG_ReadMemory32Bit(addressToRead, bytesToRead);

        // copy read32.data into data array
        data = concatArrayBuffers(data, read32data.buffer);

        // update remaining bytes counter
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    // return data as DataView
    if (data instanceof ArrayBuffer) {
        data = new DataView(data);
    }

    return data;
};


const readMemory = async (baseAddress, sizeInBytes) => {

    let data = new ArrayBuffer(0);
    let view = new DataView(data);
    if (sizeInBytes == 0) {
        return { view };
    }

    // read from target an array of bytes, automatically optimizing read operations
    let addressToRead = baseAddress;
    let remainingBytes = sizeInBytes;
    let bytesToRead;

    // if address is not 32 bits aligned
    if (addressToRead % 4 != 0) {
        if (remainingBytes < 4 - (addressToRead % 4)) {
            bytesToRead = remainingBytes;
        } else {
            bytesToRead = 4 - (addressToRead % 4);
        }

        let read8data = await JTAG_ReadMemory8Bit(addressToRead, bytesToRead);

        // copy read8.data into data array
        data = concatArrayBuffers(data, read8data.buffer);

        // update remaining bytes counter and address to read from
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    // then read as many 32-bit words as possible
    bytesToRead = Math.floor(remainingBytes / 4) * 4;
    logger("32-bit bytesToRead:", bytesToRead);

    if (bytesToRead > 0) {
        // read requested bytes in 32-bit mode
        let read32data = await JTAG_ReadMemory32Bit_ex(addressToRead, bytesToRead);

        // copy read32.data into data array
        data = concatArrayBuffers(data, read32data.buffer);

        // update remaining bytes counter
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    // Now read remaining bytes (if any)
    // at last, use one 8-bit read operation to read out remaining bytes that are not 32-bit aligned (max 3)
    logger("8-bit remainingBytes:", remainingBytes);
    if (remainingBytes > 0) {
        let read8data = await JTAG_ReadMemory8Bit(addressToRead, remainingBytes);

        // copy read8.data into data array
        data = concatArrayBuffers(data, read8data.buffer);
    }

    // always return DataView
    if (data instanceof ArrayBuffer) {
        view = new DataView(data);
        return view;
    }

    return { data };
};

const JTAG_WriteMemory32Bit_ex = async (address, size, buffer) => {

    if (size <= 0 || size >= 0xffffffff) {
        logger("size n not in the range : ", size);
        throw new STLinkException(`size n not in the range: ${size}`, STATUS.BAD_PARAMETER);
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        logger("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        throw new STLinkException(`size and address must be 4-bytes aligned (32-bit access): ${size} : ${address}`, STATUS.BAD_PARAMETER);
    }

    let addressToWrite = address;
    let remainingBytes = size;
    let offset = 0;

    while (remainingBytes > 0) {

        let bytesToWrite = Math.min(JLINK_MAX_SIZE, remainingBytes);

        // write requested bytes in 32-bit mode
        await JTAG_WriteMemory32Bit(addressToWrite, bytesToWrite, buffer.slice(offset, offset + bytesToWrite));

        // update remaining bytes counter
        remainingBytes -= bytesToWrite;
        addressToWrite += bytesToWrite;
        offset += bytesToWrite;
    }
};

const writeMemory = async (baseAddress, sizeInBytes, buffer) => {

    if (sizeInBytes == 0) {
        return;
    }

    // read from target an array of bytes, automatically optimizing write operations
    let addressToWrite = baseAddress;
    let remainingBytes = sizeInBytes;
    let bytesToWrite;
    let offset = 0;

    // if address is not 32 bits aligned
    if (addressToWrite % 4 != 0) {
        if (remainingBytes < 4 - (addressToWrite % 4)) {
            bytesToWrite = remainingBytes;
        } else {
            bytesToWrite = 4 - (addressToWrite % 4);
        }

        await JTAG_WriteMemory8Bit(addressToWrite, bytesToWrite, buffer.slice(offset, offset + bytesToWrite));

        // update remaining bytes counter and address to write to
        remainingBytes -= bytesToWrite;
        addressToWrite += bytesToWrite;
        offset += bytesToWrite;
    }

    // then write as many 32-bit words as possible
    bytesToWrite = Math.floor(remainingBytes / 4) * 4;
    logger("32-bit bytesToWrite:", bytesToWrite);

    if (bytesToWrite > 0) {
        // read requested bytes in 32-bit mode
        await JTAG_WriteMemory32Bit_ex(addressToWrite, bytesToWrite, buffer.slice(offset, offset + bytesToWrite));

        // update remaining bytes counter
        remainingBytes -= bytesToWrite;
        addressToWrite += bytesToWrite;
        offset += bytesToWrite;
    }

    // Now write remaining bytes (if any)
    // at last, use one 8-bit read operation to read out remaining bytes that are not 32-bit aligned (max 3)
    logger("8-bit remainingBytes:", remainingBytes);
    if (remainingBytes > 0) {
        await JTAG_WriteMemory8Bit(addressToWrite, remainingBytes, buffer.slice(offset, offset + remainingBytes));
    }
};

///////////////////////////////////////////////////////////////////////////////
// exports

// generic interface
export { request, open, close, isOpened } from "./stLinkDrv.js";
export { getVersion, getCurrentMode, modeString, exitDFUMode };

// JTAG interface
export { initAccessPoint, closeAccessPoint };
export { enterJTAG, enterSWD, exitJTAG, JTAG_ReadIdCodes, getSTM32MCUString };
export { getJTAGFrequencies, getSWDFrequencies, v3getSWDFrequencies, v3getJTAGFrequencies };
export { JTAG_SetJTAGFrequency, JTAG_SetSWDFrequency, JTAG_SetComFrequency, JTAG_GetComFrequency };
export { JTAG_ReadMemory32Bit, JTAG_ReadMemory16Bit, JTAG_ReadMemory8Bit };
export { JTAG_WriteMemory32Bit, JTAG_WriteMemory8Bit };

// other
export { blinkLed };

// extensions
export { JTAG_ReadMemory32Bit_ex, readMemory };
export { JTAG_WriteMemory32Bit_ex, writeMemory };

// SWIM interface - NOT IMPLEMENTED

// async read_target_voltage() {
//     let rx = await this._connector.xfer([STLINK_GET_TARGET_VOLTAGE], {"rx_len": 8});
//     let a0 = rx.getUint32(0, true);
//     let a1 = rx.getUint32(4, true);
//     this._target_voltage = (a0 !== 0) ? (2 * a1 * 1.2 / a0) : null;
// }
