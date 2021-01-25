/*!
 * Copyright(c) 2021 Pawel Hryniszak
 */

import { STATUS, PRODUCTS, VENDORS, errorString } from "./stLinkConst.js";

// https://github.com/visionmedia/debug
// localStorage.debug = 'stlink:*'
const logger = debug("stlink:drv");

let device = null;

export class STLinkException extends Error {
    constructor(message, errcode = 0) {
        super(message);
        this.errcode = errcode;
    }

    toString() {
        if (this.errcode) {
            return ` ${this.message} : ${errorString(this.errcode)} (0x${this.address.toString(16)})`;
        } else {
            return this.message;
        }
    }
}

// https://stackoverflow.com/questions/41876880/webusb-getdevices-empty-list
const request = async () => {
    let filter = [];
    for (var key in PRODUCTS) {
        filter.push({
            vendorId: parseInt(Object.keys(VENDORS)[0], 16), productId: parseInt(key, 16)
        });
    }
    device = await navigator.usb.requestDevice({ filters: filter });
    return { result: STATUS.OK };
};

const open = async () => {
    await device.open();
    if (device.configuration === null) {
        await device.selectConfiguration(1);
    }

    /* The configuration attribute contains the currently selected configuration for the device and SHALL be
        one of the configurations listed in configurations. It MAY be null if the device is in an unconfigured
        state and MUST be updated by selectConfiguration().
        The configurations attribute contains a list of configurations supported by the device. These configurations
        SHALL be populated from the configuration descriptors reported by the device and the number of elements in this
        list SHALL match the value of the bNumConfigurations field of the device descriptor.
     */
    // STLink devices only have one USB interface.
    const DEBUG_INTERFACE_NUMBER = 0;
    await device.claimInterface(DEBUG_INTERFACE_NUMBER);
    await device.selectAlternateInterface(DEBUG_INTERFACE_NUMBER, DEBUG_INTERFACE_NUMBER);
};

// here one exception with return value: not object but simple number result
const sendCommand = async (req) => {

    if (!device || !device.opened) {
        logger("Device not opened");
        throw new STLinkException("STLink not opened");
    }

    // write command
    if (req.cmd_length) {
        await device.transferOut(req.ep_out, req.cmd);
    }

    // Optional data out phase.
    if (req.out_length) {
        await device.transferOut(req.ep_out, req.out);
    }

    // Optional data in phase.
    if (req.in_length) {
        let result = await device.transferIn(req.ep_in, req.in_length);
        if (result.data && result.data.byteLength === req.in_length) {
            if (req.in_length_ex)
                req.in = new DataView(result.data.buffer.slice(0, req.in_length_ex));
            else
                req.in = new DataView(result.data.buffer.slice(0));
        } else {
            throw new STLinkException(`Error, only ${result.bytesWritten} Bytes was received to STLink instead of expected ${req.in_length}`);
        }
    }
};

const isOpened = () => {
    let res = device && device.opened;
    if (res) { return res; }
    else { return false; }
};

const close = async () => {
    await device.close();
    device = null;
};

export { request, open, close, sendCommand, isOpened };