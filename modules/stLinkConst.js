/*!
 * Copyright(c) 2021 Pawel Hryniszak
 */

const CONST = {
    DRV_REQUEST_WRITE: 0X1, //Through EP2OUT (WARNING: for V2 was 0x02)
    DRV_REQUEST_READ_EP3: 0X2, //Through EP3IN (SWV) (WARNING: for V2 was 0x03)
    DRV_REQUEST_READ_EP1: 0x1, // Through EP1IN
};

const STATUS = {
    // JTAG status codes
    OK: 0x80,  // !!! the same as JTAG_RUNNING !!!
    JTAG_UNKNOWN_ERROR: 0x01,
    JTAG_SPI_ERROR: 0x02, //internal error in JTAG protocol implementation entering SWD/JTAG mode
    JTAG_DMA_ERROR: 0x03,
    JTAG_UNKNOWN_JTAG_CHAIN: 0x04, //unexpected IRSCAN chain width
    JTAG_NO_DEVICE_CONNECTED: 0x05, //no target detected on the JTAG chain
    JTAG_INTERNAL_ERROR: 0x06, //command ignored (unknown parameter or wrong ST-Link mode when called)
    JTAG_CMD_WAIT: 0x07,
    JTAG_CMD_ERROR: 0x08, //Bad parameter when setting JTAG frequency
    JTAG_GET_IDCODE_ERROR: 0x09,
    JTAG_ALIGNMENT_ERROR: 0x0a,
    JTAG_DBG_POWER_ERROR: 0x0b,
    JTAG_WRITE_ERROR: 0x0c,
    JTAG_WRITE_VERIF_ERROR: 0x0d,
    JTAG_ALREADY_OPENED_IN_OTHER_MODE: 0x0e, // New from V2J24

    SWD_AP_WAIT: 0x10, //SWD protocol implementation error
    SWD_AP_FAULT: 0x11, //SWD protocol implementation error
    SWD_AP_ERROR: 0x12, //SWD protocol implementation error
    SWD_AP_PARITY_ERROR: 0x13, //SWD protocol implementation error
    SWD_DP_WAIT: 0x14, //SWD protocol implementation error
    SWD_DP_FAULT: 0x15, //SWD protocol implementation error
    SWD_DP_ERROR: 0x16, //SWD protocol implementation error
    SWD_DP_PARITY_ERROR: 0x17, //SWD protocol implementation error

    SWD_AP_WDATA_ERROR: 0x18,
    SWD_AP_STICKY_ERROR: 0x19, // No more specific to SWD from V2J24
    SWD_AP_STICKYORUN_ERROR: 0x1a, // No more specific to SWD from V2J24
    AP_ALREADY_USED: 0x1b,
    TRACE_AP_TURNAROUND: 0x1c,
    BAD_AP: 0x1d, //Incorrect Access Port index

    SWV_NOT_AVAILABLE: 0x20, // New in ST-Link/V2
    NO_JUMP_TO_USB_LOADER: 0x21, // New in ST-Link/V2, from V2J18S4 - The jump is not supported by the hardware

    JTAG_TCPID_NOT_FOUND: 0x30, // New in ST-Link/V2 from version J28
    JTAG_TCPID_MAX_REACHED: 0x31, // New in ST-Link/V2 from version J28

    JTAG_CONF_CHANGED: 0x40, //configuration has been changed regarding previous settings due to new clock.
    JTAG_FREQ_NOT_SUPPORTED: 0x41,
    JTAG_UNKNOWN_CMD: 0x42,

    JTAG_RUNNING: 0x80,
    JTAG_HALT: 0x81,

    JTAG_OLD_ERROR: 0x81, //0x81 is the general error code of first API

    // ext
    DEVICE_NOT_SUPPORTED: 0x10000,
    JTAG_FREQUENCY_NOT_SUPPORTED: 0x10001,
    SWD_FREQUENCY_NOT_SUPPORTED: 0x10002,
    FREQUENCY_NOT_SUPPORTED: 0x10003,
    BAD_PARAMETER: 0x10004,
};

/**
 * Maps JTAG error code to a string describing error.
 *
 * @param {number} errorCode - The error code value.
 * @returns {string} - The error string.
 */
function errorString(errorCode) {

    switch (errorCode) {
        case STATUS.JTAG_UNKNOWN_ERROR:
            return "JTAG unknown error";
        case STATUS.JTAG_SPI_ERROR:
            return "internal error in JTAG protocol implementation entering SWD/JTAG mode";
        case STATUS.JTAG_DMA_ERROR:
            return "internal JTAG DMA error";
        case STATUS.JTAG_UNKNOWN_JTAG_CHAIN:
            return "Unknown JTAG chain, unexpected IRSCAN chain width";
        case STATUS.JTAG_NO_DEVICE_CONNECTED:
            return "JTAG/SWD no device connected";
        case STATUS.JTAG_INTERNAL_ERROR:
            return "command ignored (unknown parameter or wrong ST-Link mode when called)";
        case STATUS.JTAG_CMD_WAIT:
            return "JTAG_CMD_WAIT";
        case STATUS.JTAG_CMD_ERROR:
            return "Bad parameter when setting JTAG frequency";
        case STATUS.JTAG_GET_IDCODE_ERROR:
            return "JTAG_GET_IDCODE_ERROR";
        case STATUS.JTAG_ALIGNMENT_ERROR:
            return "JTAG_ALIGNMENT_ERROR";
        case STATUS.JTAG_DBG_POWER_ERROR:
            return "JTAG_DBG_POWER_ERROR";
        case STATUS.JTAG_WRITE_ERROR:
            return "JTAG/SWD write error";
        case STATUS.JTAG_WRITE_VERIF_ERROR:
            return "JTAG_WRITE_VERIF_ERROR";
        case STATUS.JTAG_ALREADY_OPENED_IN_OTHER_MODE:
            return "JTAG/SWD already opened in other mode";
        case STATUS.SWD_AP_WAIT:
        case STATUS.SWD_AP_FAULT:
        case STATUS.SWD_AP_ERROR:
        case STATUS.SWD_AP_PARITY_ERROR:
        case STATUS.SWD_DP_WAIT:
        case STATUS.SWD_DP_FAULT:
        case STATUS.SWD_DP_ERROR:
        case STATUS.SWD_DP_PARITY_ERROR:
            return "SWD error";
        case STATUS.SWD_AP_WDATA_ERROR:
            return "SWD_AP_WDATA_ERROR";
        case STATUS.SWD_AP_STICKY_ERROR:
            return "SWD_AP_STICKY_ERROR";
        case STATUS.SWD_AP_STICKYORUN_ERROR:
            return "SWD_AP_STICKYORUN_ERROR";
        case STATUS.AP_ALREADY_USED:
            return "AP_ALREADY_USED";
        case STATUS.TRACE_AP_TURNAROUND:
            return "TRACE_AP_TURNAROUND";
        case STATUS.BAD_AP:
            return "Incorrect Access Port index";
        case STATUS.SWV_NOT_AVAILABLE:
            return "SWV_NOT_AVAILABLE";
        case STATUS.NO_JUMP_TO_USB_LOADER:
            return "The jump is not supported by the hardware";
        case STATUS.JTAG_TCPID_NOT_FOUND:
            return "JTAG_TCPID_NOT_FOUND";
        case STATUS.JTAG_TCPID_MAX_REACHED:
            return "JTAG_TCPID_MAX_REACHED";
        case STATUS.JTAG_CONF_CHANGED:
            return "configuration has been changed regarding previous settings due to new clock";
        case STATUS.JTAG_FREQ_NOT_SUPPORTED:
            return "JTAG_FREQ_NOT_SUPPORTED";
        case STATUS.JTAG_UNKNOWN_CMD:
            return "JTAG_UNKNOWN_CMD";
        case STATUS.JTAG_OLD_ERROR:
            return "JTAG_OLD_ERROR";
        // ext
        case STATUS.STLINK_DEVICE_NOT_SUPPORTED:
            return "Device not supported";
        case STATUS.JTAG_FREQUENCY_NOT_SUPPORTED:
            return "JTAG frequency not supported";
        case STATUS.SWD_FREQUENCY_NOT_SUPPORTED:
            return "SWD frequency not supported";
        case STATUS.FREQUENCY_NOT_SUPPORTED:
            return "Frequency not supported";
        case STATUS.BAD_PARAMETER:
            return "Bad parameter";
        default:
            return "Unknown error";
    }
}

// definitions for interface towards CLI only
const MODES = {
    // GET CURRENT MODE returned values
    DEV_DFU_MODE: 0x00,
    DEV_MASS_MODE: 0x01,
    DEV_JTAG_MODE: 0x02,
    DEV_SWIM_MODE: 0x03,
    DEV_BTLD_MODE: 0x04,
};

const STM32MCU = {
    0x000: "STM32",
    0x410: "STM32F10xxx",
    0x411: "STM32F2xxxx",
    0x412: "STM32F10xxx",
    0x413: "STM32F40xxx/41xxx",
    0x414: "STM32F10xxx",
    0x415: "STM32L47xxx/48xxx",
    0x416: "STM32L1xxx6(8/B)",
    0x417: "STM32L05xxx/06xxx",
    0x418: "STM32F105xx/107xx",
    0x419: "STM32F42xxx/43xxx",
    0x420: "STM32F10xxx",
    0x421: "STM32F446xx",
    0x422: "STM32F302xB(C)/303xB(C)/STM32F358xx",
    0x423: "STM32F401xB(C)",
    0x424: "STM32",
    0x425: "STM32L031xx/041xx",
    0x427: "STM32L1xxxC",
    0x428: "STM32F10xxx",
    0x429: "STM32L1xxx6(8/B)A",
    0x430: "STM32F10xxx",
    0x431: "STM32F411xx",
    0x432: "STM32F373xx/STM32F378xx",
    0x433: "STM32F401xD(E)",
    0x434: "STM32F469xx/479xx",
    0x435: "STM32L43xxx/44xxx",
    0x436: "STM32L1xxxD",
    0x437: "STM32L1xxxE",
    0x438: "STM32F303x4(6/8)/334xx/328xx",
    0x439: "STM32F301xx/302x4(6/8)/STM32F318xx",
    0x440: "STM32F05xxx/STM32F030x8",
    0x441: "STM32F412xx",
    0x442: "STM32F030xC/STM32F09xxx",
    0x444: "STM32F03xx4/6",
    0x445: "STM32F04xxx/STM32F070x6",
    0x446: "STM32F302xD(E)/303xD(E)/STM32F398xx",
    0x447: "STM32L07xxx/08xxx",
    0x448: "STM32F070xB/STM32F071xx/072xx",
    0x449: "STM32F74xxx/75xxx",
    0x450: "STM32H74xxx/75xxx",
    0x451: "STM32F76xxx/77xxx",
    0x452: "STM32F72xxx/73xxx",
    0x457: "STM32L01xxx/02xxx",
    0x458: "STM32F410xx",
    0x460: "STM32G07xxx/08xxx",
    0x461: "STM32L496xx/4A6xx",
    0x462: "STM32L45xxx/46xxx",
    0x463: "STM32F413xx/423xx",
    0x464: "STM32L412xx/422xx",
    0x466: "STM32G03xxx/04xxx",
    0x467: "STM32G0Bxxx/0Cxxx",
    0x468: "STM32G431xx/441xx",
    0x469: "STM32G47xxx/48xxx",
    0x470: "STM32L4Rxx/4Sxx",
    0x471: "STM32L4P5xx/Q5xx",
    0x472: "STM32L552xx/562xx",
    0x479: "STM32G491xx/4A1xx",
    0x480: "STM32H7A3xx/B3xx",
    0x482: "STM32U57xxx/585xx",
    0x483: "STM32H72xxx/73xxx",
    0x494: "STM32WB10xx/WB15xx",
    0x495: "STM32WB5xxx/WB3xxx",
    0x496: "STM32WB5xxx/WB3xxx",
    0x497: "STM32WLExxx/WL5xxx",
    0x9a8: "STM32",
    0x9b0: "STM32"
};

class TDeviceRequest {
    constructor() {

        this.cmd = new ArrayBuffer(16); // Command header
        this.cmd_length = 0; // Command header length
        this.cmd_ui8arr = new Uint8Array(this.cmd);

        this.in = null;
        this.in_length = 0;
        this.in_length_ex = 0;

        this.out = new ArrayBuffer(0);
        this.out_length = 0;

        this.ep_in = CONST.DRV_REQUEST_READ_EP1;
        this.ep_out = CONST.DRV_REQUEST_WRITE;
    }
}

const PRODUCTS = {
    // "3744": "ST-Link v1",
    // "3748": "ST-Link v2",
    "374A": "ST-Link v2-1A",
    "374B": "ST-Link v2-1B",
    "374E": "ST-Link v3-E",
    "374F": "ST-Link v3",
    "3753": "ST-Link v3-?",
    "3754": "ST-Link v3-Emb",
    "3755": "ST-Link v3-?",
    "3757": "ST-Link v3-?"
};

const JTAGFrequencies = {
    "18 MHz": 2,
    "9 MHz": 4,
    "4.5 MHz": 8,
    "2.25 MHz": 16,
    "1.12 MHz - Default": 32,
    "560 kHz": 64,
    "280 kHz": 128,
    "140 kHz": 256
};

const SWDFrequencies = {
    "4.6 MHz": 0,
    "1.8 MHz - Default": 1,
    "950 kHz": 3,
    //"650 kHz": 5,
    //"480 kHz": 7,
    "400 kHz": 9,
    //"360 kHz": 10,
    //"240 kHz": 15,
    "150 kHz": 25
};

const VENDORS = {
    "0483": "ST-Microelectronics"
};

export { STATUS, MODES, TDeviceRequest, PRODUCTS, VENDORS, STM32MCU, JTAGFrequencies, SWDFrequencies, errorString };