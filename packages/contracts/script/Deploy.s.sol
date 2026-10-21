// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/erc6551/Registry.sol";
import {TokenBoundAccount} from "../src/erc6551/TokenBoundAccount.sol";
import {Critter} from "../src/Critter.sol";

/// @notice Деплой сцены «Пухляндия» на Base Sepolia (демо-сеть) или anvil (сухой прогон).
/// Ни одного ключа в коде: DEPLOYER_PRIVATE_KEY читается из .env.
/// Порядок важен: сначала TBA-implementation, потом Registry, затем Critter —
/// адрес Registry и impl нужны TBA-кошельку (см. Registry.createAccount).
contract DeployScript is Script {
    Registry public registry;
    TokenBoundAccount public accountImpl;
    Critter public critter;

    function run() external {
        // Тестовый ключ демо-деплоера — только из .env (см. .env.example)
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        accountImpl = new TokenBoundAccount();
        registry = new Registry();
        critter = new Critter();

        // Пухлик вылупляется сразу у демо-аккаунта — сцена 30 сек работает
        uint256 tokenId = critter.mintTo(deployer);

        vm.stopBroadcast();

        console.log("=== Puhlyandiya deploy ===");
        console.log("deployer:              %s", deployer);
        console.log("TokenBoundAccount impl: %s", address(accountImpl));
        console.log("Registry:               %s", address(registry));
        console.log("Critter:                %s", address(critter));
        console.log("minted tokenId:         %s (owner: %s)", tokenId, critter.ownerOf(tokenId));
        console.log("VITE_CRITTER_ADDRESS=%s", address(critter));
        console.log("mutation module ready");
    }
}
