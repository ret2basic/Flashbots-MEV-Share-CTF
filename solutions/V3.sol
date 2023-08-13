//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

interface IMevShareCaptureLogger {
    function totalPoints(address) external returns (uint256);
}

contract V3 {
    IMevShareCaptureLogger target = IMevShareCaptureLogger(0x6C9c151642C0bA512DE540bd007AFa70BE2f1312);

    function pwn() external {
        uint256 isWinner = target.totalPoints(0x75A24Dc4efC5324F2253ABACb98A296aC49448CA);
        // I have 18 points at this moment
        if (isWinner == 18) {
            revert("Attempt failed");
        }
    }
}