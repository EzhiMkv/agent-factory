// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/erc6551/Registry.sol";
import {TokenBoundAccount} from "../src/erc6551/TokenBoundAccount.sol";
import {Achievements} from "../src/Achievements.sol";
import {Critter} from "../src/Critter.sol";

/// @notice Деплой сцены «Пухляндия» на Base Sepolia (демо-сеть) или anvil (сухой прогон).
/// Ни одного ключа в коде: DEPLOYER_PRIVATE_KEY читается из .env.
/// Порядок важен: TBA-implementation → Registry → Critter → минт → TBA-кошелёк
/// пухлика → Achievements с тем же salt → проводка хука ачивок в Critter.
contract DeployScript is Script {
    Registry public registry;
    TokenBoundAccount public accountImpl;
    Critter public critter;
    Achievements public achievements;
    address public tba;

    // Один salt для createAccount и Achievements — иначе предсказанный
    // адрес кошелька пухлика не совпадёт с реальным (см. Achievements.constructor)
    bytes32 public constant ACCOUNT_SALT = keccak256("puhlyandiya-demo-tba");

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

        // Кошелёк пухлика (ERC-6551): карточка TBA в UI читает адрес и баланс
        tba = registry.createAccount(
            address(accountImpl), ACCOUNT_SALT, block.chainid, address(critter), tokenId
        );

        // Ачивки за эволюции минтятся в TBA (хук включается отдельной проводкой)
        achievements = new Achievements(address(critter), address(registry), address(accountImpl), ACCOUNT_SALT);
        critter.setAchievements(address(achievements));

        vm.stopBroadcast();

        console.log("=== Puhlyandiya deploy ===");
        console.log("deployer:              %s", deployer);
        console.log("TokenBoundAccount impl: %s", address(accountImpl));
        console.log("Registry:               %s", address(registry));
        console.log("Critter:                %s", address(critter));
        console.log("TBA (wallet of pet):    %s", tba);
        console.log("Achievements:           %s", address(achievements));
        console.log("minted tokenId:         %s (owner: %s)", tokenId, critter.ownerOf(tokenId));
        console.log("VITE_CRITTER_ADDRESS=%s", address(critter));
        console.log("VITE_REGISTRY_ADDRESS=%s", address(registry));
        console.log("VITE_ACHIEVEMENTS_ADDRESS=%s", address(achievements));
    }
}
