const STATUS = {};
STATUS.OK = 128;
STATUS.BAD_PARAMETER = -1;
const MAX_32BIT_SIZE = 4096; // 6144;

const JTAG_ReadMemory8Bit = (address, size) => {
    console.log(`JTAG_ReadMemory8Bit(${address}, ${size})`);
    let buff = new Uint8Array(size);
    return {
        result: STATUS.OK,
        data: buff,
        size: size
    };
};

const JTAG_ReadMemory32Bit_ex = (address, size) => {

    if (size <= 0 || size >= 0xffffffff) {
        console.log("size n not in the range : ", size);
        return { result: STATUS.BAD_PARAMETER };
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        console.log("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        return { result: STATUS.BAD_PARAMETER };
    }

    let addressToRead = address;
    let remainingBytes = size;
    let data = [];

    while (remainingBytes > 0) {

        let bytesToRead = Math.min(MAX_32BIT_SIZE, remainingBytes);

        // read requested bytes in 32-bit mode
        let read32 = JTAG_ReadMemory32Bit(addressToRead, bytesToRead);

        if (read32.result != STATUS.OK) {
            console.log("JTAG_ReadMemory32Bit read error ", read32.result);
            // closeAccessPoint();
            return { result: read32.result };
        }

        // copy read32.data into data array
        data.push(...read32.data);

        // update remaining bytes counter
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    return {
        result: STATUS.OK,
        data: data,
        size: size
    };
};

const JTAG_ReadMemory32Bit = (address, size) => {
    console.log(`JTAG_ReadMemory32Bit(${address}, ${size})`);

    // size must not be <= 0 or > 6144 for 32-bit accesses
    if (size <= 0 || size > MAX_32BIT_SIZE) {
        console.log("size n not in the range : ", size);
        return { result: STATUS.BAD_PARAMETER };
    }

    // size and address must be 4-bytes aligned (32-bit access)
    if (size % 4 != 0 || address % 4 != 0) {
        console.log("size and address must be 4-bytes aligned (32-bit access): ", size, " : ", address);
        return { result: STATUS.BAD_PARAMETER };
    }

    let buff = new Uint8Array(size);
    return {
        result: STATUS.OK,
        data: buff,
        size: size
    };
};



const read_mem = (baseAddress, sizeInBytes) => {

    if (sizeInBytes == 0) {
        return { result: STATUS.OK };
    }

    // read from target an array of bytes, automatically optimizing read operations
    let addressToRead = baseAddress;
    let remainingBytes = sizeInBytes;
    let bytesToRead;
    let data = [];

    // if address is not 32 bits aligned
    if (addressToRead % 4 != 0) {
        if (remainingBytes < 4 - (addressToRead % 4)) {
            bytesToRead = remainingBytes;
        } else {
            bytesToRead = 4 - (addressToRead % 4);
        }

        let read8 = JTAG_ReadMemory8Bit(addressToRead, bytesToRead);

        if (read8.result != STATUS.OK) {
            console.log("JTAG_ReadMemory8Bit read error ", read8.result);
            // closeAccessPoint();
            return { result: read8.result };
        }

        // copy read8.data into data array
        data.push(...read8.data);

        // update remaining bytes counter and address to read from
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    // then read as many 32-bit words as possible
    bytesToRead = Math.floor(remainingBytes / 4) * 4;
    console.log("32-bit bytesToRead", bytesToRead);

    if (bytesToRead > 0) {
        // read requested bytes in 32-bit mode
        let read32 = JTAG_ReadMemory32Bit_ex(addressToRead, bytesToRead);

        if (read32.result != STATUS.OK) {
            console.log("JTAG_ReadMemory32Bit_ex read error ", read32.result);
            // closeAccessPoint();
            return { result: read32.result };
        }

        // copy read32.data into data array
        data.push(...read32.data);

        // update remaining bytes counter
        remainingBytes = remainingBytes - bytesToRead;
        addressToRead = addressToRead + bytesToRead;
    }

    // Now read remaining bytes (if any)
    // at last, use one 8-bit read operation to read out remaining bytes that are not 32-bit aligned (max 3)
    console.log("8-bit remainingBytes", remainingBytes);
    if (remainingBytes > 0) {
        let read8 = JTAG_ReadMemory8Bit(addressToRead, remainingBytes);

        if (read8.result != STATUS.OK) {
            console.log("JTAG_ReadMemory8Bit read error ", read8.result);
            // closeAccessPoint();
            return { result: read8.result };
        }

        // copy read8.data into data array
        data.push(...read8.data);
    }

    return { result: STATUS.OK };
};