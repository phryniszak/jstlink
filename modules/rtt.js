/*!
 * Copyright(c) 2021 Pawel Hryniszak
 */

import * as STLink from "./stLink.js";
const logger = debug("stlink:rtt");

const MAX_STR_LENGTH = 64;
const TERMINAL_INDEX = 0;

const status = {};

const init = () => {
    status.mcuid = -1;
    status.RAM = { address: 0x20000000, size: 0x1000 };
    status.address = 0;
    status.MaxNumUpBuffers = 0;
    status.MaxNumDownBuffers = 0;
    status.paUp = 0;
    status.paDown = 0;
    status.aUp = [];
    status.aDown = [];
    status.rttDescMem = null;
    status.rttWrMem = null;
};

const find = async (options) => {

    init();
    options = options || {};
    status.RAM.address = options.address || 0x20000000;
    status.RAM.size = options.size || 0x1000;

    await STLink.enterSWD();
    status.mcuid = await STLink.JTAG_ReadIdCodes();

    // try to make a sense from received id
    // let mcuidstr = status.mcuid.toString(16).padStart(4, "0");

    // let ucstm32 = mcu.find(element => element.dieId = mcuidstr);
    // logger("ucstm32", ucstm32);

    // let RAM = ucstm32.memories.memory.find(element => element.type = "RAM");
    // if (RAM !== undefined) {
    //     status.RAM.address = parseInt(RAM.address, 16);
    //     status.RAM.size = parseInt(RAM.size, 16);
    // }

    // find RTT
    logger("find RTT");
    let mem = await STLink.readMemory(status.RAM.address, status.RAM.size);
    let segger_rtt_str = new DataView(new ArrayBuffer(16));
    Array.prototype.map.call("SEGGER RTT", (letter, index) => segger_rtt_str.setUint8(index, letter.charCodeAt(0)));

    for (let index = 0; index < (mem.byteLength - 16); index++) {
        if ((segger_rtt_str.getBigUint64(0, true) == mem.getBigUint64(index, true))
            && (segger_rtt_str.getBigUint64(8, true) == mem.getBigUint64(index + 8, true))) {
            status.address = index;
            logger("SEGGER RTT found");
            break;
        }
    }

    // rtt not found
    if (!status.address) {
        logger("SEGGER RTT not found");
        return;
    }

    status.MaxNumUpBuffers = mem.getUint32(status.address + 16, true);
    status.MaxNumDownBuffers = mem.getUint32(status.address + 20, true);
    status.address += status.RAM.address;
    status.paUp = status.address + 24;
    status.paDown = status.address + 24 + (status.MaxNumUpBuffers * 24);

    for (let index = 0; index < status.MaxNumUpBuffers; index++) {
        let buff = {};
        let offset = status.paUp + 24 * index - status.RAM.address;
        buff.sName = mem.getUint32(offset + 0, true);         // Optional name. Standard names so far are: "Terminal", "SysView", "J-Scope_t4i4"
        buff.pBuffer = mem.getUint32(offset + 4, true);       // Pointer to start of buffer
        buff.SizeOfBuffer = mem.getUint32(offset + 8, true);  // Buffer size in bytes. Note that one byte is lost, as this implementation does not fill up the buffer in order to avoid the problem of being unable to distinguish between full and empty.
        offset = status.paUp + 24 * index;
        buff.pWrOff = offset + 12;        // pointer to position of next item to be written by either target.
        buff.pRdOff = offset + 16;        // pointer to position of next item to be read by host. Must be volatile since it may be modified by host.
        buff.pFlags = offset + 20;        // pointer to configuration flags

        // read name from FLASH
        if (buff.sName) {
            let name = await STLink.readMemory(buff.sName, MAX_STR_LENGTH);
            buff.name = ASCIIecoderDV(name);
        } else {
            buff.name = "";
        }

        status.aUp.push(buff);
    }

    for (let index = 0; index < status.MaxNumDownBuffers; index++) {
        let buff = {};
        let offset = status.paDown + 24 * index - status.RAM.address;
        buff.sName = mem.getUint32(offset + 0, true);         // Optional name. Standard names so far are: "Terminal", "SysView", "J-Scope_t4i4"
        buff.pBuffer = mem.getUint32(offset + 4, true);       // Pointer to start of buffer
        buff.SizeOfBuffer = mem.getUint32(offset + 8, true);  // Buffer size in bytes. Note that one byte is lost, as this implementation does not fill up the buffer in order to avoid the problem of being unable to distinguish between full and empty.
        offset = status.paDown + 24 * index;
        buff.pWrOff = offset + 12;        // pointer to position of next item to be written by host.
        buff.pRdOff = offset + 16;        // pointer to position of next item to be read by host. Must be volatile since it may be modified by host.
        buff.pFlags = offset + 20;        // pointer to configuration flags

        // read name from FLASH
        if (buff.sName) {
            let name = await STLink.readMemory(buff.sName, MAX_STR_LENGTH);
            buff.name = ASCIIecoderDV(name);
        } else {
            buff.name = "";
        }

        status.aDown.push(buff);
    }

    // get max min memory range
    // let RAMrange = [];
    // RAMrange.push(status.address);
    // RAMrange.push(status.address + 16 + 4 + 4 + (status.MaxNumUpBuffers * 24) + (status.MaxNumDownBuffers * 24));

    // // here we are only interested in terminal
    // if (status.aUp[TERMINAL_INDEX].SizeOfBuffer) {
    //     RAMrange.push(status.aUp[TERMINAL_INDEX].pBuffer);
    //     RAMrange.push(status.aUp[TERMINAL_INDEX].pBuffer + status.aUp[TERMINAL_INDEX].SizeOfBuffer);
    // } else {
    //     // ERROR
    // }

    // status.upRAMmin = Math.min(...RAMrange);
    // status.upRAMsize = Math.max(...RAMrange) - status.upRAMmin;
    // logger(`read min: 0x${status.upRAMmin.toString(16)} size: ${status.upRAMsize}`);
};

const read = async () => {

    // we could be reading only WrOff/RdOff of Terminal up buffer but lets leave it as it is 
    let mem = await STLink.readMemory(status.address, 16 + 4 + 4 + (status.MaxNumUpBuffers * 24) + (status.MaxNumDownBuffers * 24));

    // save it in global, we may need it for write, as it doesn't change in uc
    status.rttDescMem = mem;

    let WrOff = mem.getUint32(status.aUp[TERMINAL_INDEX].pWrOff - status.address, true); // Position of next item to be written by either target.
    let RdOff = mem.getUint32(status.aUp[TERMINAL_INDEX].pRdOff - status.address, true); // Position of next item to be read by host. Must be volatile since it may be modified by host.

    logger("------------------------------------");
    logger(`RdOff: ${RdOff} WrOff: ${WrOff}`);

    mem = await STLink.readMemory(status.aUp[TERMINAL_INDEX].pBuffer, status.aUp[TERMINAL_INDEX].SizeOfBuffer);

    let buffer = [];

    // we start reading from position in memory RdOff until we reach WrOff
    while (RdOff !== WrOff) {

        buffer.push(mem.getUint8(RdOff));

        RdOff++;

        // Handle wrap-around of buffer
        if (RdOff >= status.aUp[TERMINAL_INDEX].SizeOfBuffer) {
            RdOff = 0;
        }
    }

    if (buffer.length) {
        // now save information about amount we read
        // we read up to value of data - we can use it (WrOff)
        // other way we should be doing some maths with wrap-around logic
        logger(`read rtt length: ${buffer.length}`);
        // logger(buffer.toString());
        // logger(ASCIIecoderArr(buffer));
        let wrbuff = new ArrayBuffer(4);
        var view = new DataView(wrbuff, 0);
        view.setUint32(0, WrOff, true);
        await STLink.JTAG_WriteMemory32Bit(status.aUp[TERMINAL_INDEX].pRdOff, 4, wrbuff);
    }

    return buffer;
};

const open = async () => {
    await STLink.request();
    await STLink.open();
};

const getMCUstring = () => {
    return STLink.getSTM32MCUString(status.mcuid);
};

const write = async (data) => {
    if (typeof data === "number")
        await _writeArr([data]);
    if (Array.isArray(data))
        await _writeArr(data);
    else
        logger("Unknown write data format: ", data.toString());

};

const _writeArr = async (arr) => {

    if (!status.rttDescMem) {
        status.rttDescMem = await STLink.readMemory(status.address, 16 + 4 + 4 + (status.MaxNumUpBuffers * 24) + (status.MaxNumDownBuffers * 24));
    }

    // how much we can write in non blocking mode
    let available = _getAvailWriteSpace();
    let numWrite = Math.min(available, arr.length);

    let WrOff = status.rttDescMem.getUint32(status.aDown[TERMINAL_INDEX].pWrOff - status.address, true);

    const buffSize = status.aDown[TERMINAL_INDEX].SizeOfBuffer;

    // init write "shadow" memory
    if (!status.rttWrMem) {
        status.rttWrMem = new Uint8Array(buffSize);
    }

    // write buffer to shadow memory, which next step we write to uc
    for (let i = 0; i < numWrite; i++) {
        status.rttWrMem[WrOff++] = arr.pop();

        // Handle wrap-around of buffer
        if (WrOff >= buffSize) {
            WrOff = 0;
        }
    }

    // write shadow memory to uc
    await STLink.writeMemory(status.aDown[TERMINAL_INDEX].pBuffer, buffSize, status.rttWrMem.buffer);

    // update WrOff
    let wrbuff = new ArrayBuffer(4);
    var view = new DataView(wrbuff, 0);
    view.setUint32(0, WrOff, true);
    await STLink.JTAG_WriteMemory32Bit(status.aDown[TERMINAL_INDEX].pWrOff, 4, wrbuff);
};

const _getAvailWriteSpace = () => {

    let WrOff = status.rttDescMem.getUint32(status.aDown[TERMINAL_INDEX].pWrOff - status.address, true);
    let RdOff = status.rttDescMem.getUint32(status.aDown[TERMINAL_INDEX].pRdOff - status.address, true);

    if (RdOff <= WrOff) {
        return (status.aDown[TERMINAL_INDEX].SizeOfBuffer - 1 - WrOff + RdOff);
    }

    return (RdOff - WrOff - 1);
};

const ASCIIecoderDV = (buffView) => {
    let str = "";
    for (let index = 0; index < MAX_STR_LENGTH; index++) {
        let char = buffView.getUint8(index);
        if (char == 0) {
            return str;
        }
        str += String.fromCharCode(char);
    }
    // it shouldn't happen, string ending not found 
    return str;
};

export { find, open, read, write, init, getMCUstring, status };
export { isOpened } from "./stLinkDrv.js";
