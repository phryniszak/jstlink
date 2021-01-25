import * as STLink from "../modules/stLink.js";

///////////////////////////////////////////////////////////////////////////////
// VARIABLES

// elements
const btnTest = document.getElementById("btn_start_test");


const RAM_START = 0x20000000 + 0x200;
const RAM_END = 0x20008000;

const FLASH_START = 0x080001d8;
const FLASH = new Uint8Array([0x10, 0xB5, 0x05, 0x4C, 0x23, 0x78, 0x33, 0xB9, 0x04, 0x4B, 0x13, 0xB1, 0x04, 0x48, 0xAF, 0xF3, 0x00, 0x80, 0x01,
    0x23, 0x23, 0x70, 0x10, 0xBD, 0x0C, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x1C, 0x16, 0x00, 0x08, 0x08, 0xB5, 0x03, 0x4B, 0x1B, 0xB1, 0x03,
    0x49, 0x03, 0x48, 0xAF, 0xF3, 0x00, 0x80, 0x08, 0xBD, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x20, 0x1C, 0x16, 0x00, 0x08, 0x80, 0xB5, 0x00,
    0xAF, 0x00, 0xF0, 0x33, 0xF9, 0x00, 0xF0, 0x03, 0xF8, 0x00, 0xF0, 0x4C, 0xF8]);

const redColor = "background:red;color:black";
const greenColor = "background:green;color:black";

///////////////////////////////////////////////////////////////////////////////
// FUNCTIONS

function later(delay) {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}


const testRAMrdwrrnd = async () => {

    const size = getRandomInt(0, RAM_END - RAM_START);
    const offset = getRandomInt(0, RAM_END - RAM_START - size);

    console.log("---------------------------------------------------------------");
    console.log(`Start test with size: 0x${size.toString(16)} and offset: ${offset}`);

    const address = RAM_START + offset;

    const uint8buffer = new Uint8Array(size);

    uint8buffer.forEach((currentValue, index, array) => {
        array[index] = Math.floor(Math.random() * 256);
    });

    // write it
    await STLink.writeMemory(address, size, uint8buffer.buffer);

    // read it
    const readDV = await STLink.readMemory(address, size);

    // compare
    let pass = true;
    for (let index = 0; index < uint8buffer.length; index++) {
        if (readDV.getUint8(index) !== uint8buffer[index]) {
            console.log(`%ctestRAMrdwrrnd fail at index ${index}`, redColor);
            pass = false;
            break;
        }
    }

    console.log(`%ctestRAMrdwrrnd result: ${pass}`, pass ? greenColor : redColor);
};


const testRAMrdwr = async (offset, size) => {

    console.log("---------------------------------------------------------------");
    console.log(`Start test with size: 0x${size.toString(16)} and offset: ${offset}`);

    const address = RAM_START + offset;

    const uint8buffer = new Uint8Array(size);

    uint8buffer.forEach((currentValue, index, array) => {
        array[index] = Math.floor(Math.random() * 256);
    });

    // write it
    await STLink.writeMemory(address, size, uint8buffer.buffer);

    // read it
    const readDV = await STLink.readMemory(address, size);

    // compare
    let pass = true;
    for (let index = 0; index < uint8buffer.length; index++) {
        if (readDV.getUint8(index) !== uint8buffer[index]) {
            console.log(`%ctestRAMrdwr fail at index ${index}`, redColor);
            pass = false;
            break;
        }
    }

    console.log(`%ctestRAMrdwr result: ${pass}`, pass ? greenColor : redColor);
};

const testFLASHread = async (offset, size) => {

    console.log("---------------------------------------------------------------");
    console.log(`testFLASHread size: 0x${size.toString(16)} and offset: ${offset}`);

    let flashDV = await STLink.readMemory(FLASH_START + offset, size);

    // compare
    let pass = true;
    for (let index = 0; index < size; index++) {
        if (flashDV.getUint8(index) !== FLASH[index + offset]) {
            console.log(`%ctestFLASHread fail at index ${index}`, redColor);
            pass = false;
            break;
        }
    }
    console.log(`%ctestFLASHread result: ${pass}`, pass ? greenColor : redColor);
};

const test = async () => {
    console.log("Start test");


    await STLink.request();
    await STLink.open();

    let isOpen = STLink.isOpened();
    console.log("is open:", isOpen);
    if (!isOpen) return;

    await STLink.enterSWD();
    console.log("switched to SWD");

    await later(100);

    // stm32g431kb 128 Kbytes of Flash memory, and 32 Kbytes of SRAM

    // TEST READ FLASH

    await testFLASHread(3, 7);
    await testFLASHread(1, 7);
    await testFLASHread(2, 7);
    await testFLASHread(4, 7);
    await testFLASHread(5, 7);
    await testFLASHread(6, 7);
    await testFLASHread(1, 13);
    await testFLASHread(2, 12);
    await testFLASHread(3, 11);
    await testFLASHread(4, 10);
    await testFLASHread(5, 9);
    await testFLASHread(6, 8);
    await testFLASHread(3, 1);
    await testFLASHread(3, 2);
    await testFLASHread(3, 3);
    await testFLASHread(3, 4);
    await testFLASHread(3, 5);
    await testFLASHread(4, 1);
    await testFLASHread(4, 2);
    await testFLASHread(4, 3);
    await testFLASHread(4, 4);
    await testFLASHread(4, 5);
    await testFLASHread(0, FLASH.length);

    // TEST RAM
    for (let offset = 0; offset < 7; offset++) {
        for (let index = 0; index < 12; index++) {
            const size = 1 << index;
            await testRAMrdwr(offset, size);
        }
    }

    // TEST RAM with random size and offset
    for (let index = 0; index < 20; index++) {
        await testRAMrdwrrnd();
    }

    console.log("TESTS FINISHED");
};

///////////////////////////////////////////////////////////////////////////////
// EVENTS

// click on open STLINK
btnTest.onclick = test;