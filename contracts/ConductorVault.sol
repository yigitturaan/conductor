// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ConductorVault
 * @notice Conductor alert sistemi tarafından tetiklenen otomatik teminat yönetimi
 * @dev Monad testnet üzerinde çalışır — demo amaçlı basitleştirilmiş versiyon
 */
contract ConductorVault {
    address public owner;
    address public conductorBot; // Risk bot adresi

    // Kullanıcı bakiyeleri
    mapping(address => uint256) public collateral;

    // Alert kayıtları
    struct AlertAction {
        bytes32 txHash;
        uint256 blockNumber;
        string severity;
        uint256 addedCollateral;
        uint256 timestamp;
    }

    AlertAction[] public actions;
    uint256 public totalActions;

    // Events
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event EmergencyCollateralAdded(
        address indexed user,
        bytes32 indexed txHash,
        uint256 amount,
        string severity
    );
    event ConductorBotUpdated(address indexed newBot);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyConductor() {
        require(msg.sender == conductorBot || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        conductorBot = msg.sender;
    }

    /// @notice Teminat yatır
    function deposit() external payable {
        require(msg.value > 0, "Zero deposit");
        collateral[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Teminat çek
    function withdraw(uint256 amount) external {
        require(collateral[msg.sender] >= amount, "Insufficient collateral");
        collateral[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Conductor bot tarafından çağrılır — acil teminat ekleme
    /// @dev Risk bot high/critical alert aldığında bu fonksiyonu çağırır
    function addEmergencyCollateral(
        address user,
        bytes32 txHash,
        string calldata severity
    ) external payable onlyConductor {
        require(msg.value > 0, "Zero collateral");
        collateral[user] += msg.value;

        AlertAction memory action = AlertAction({
            txHash: txHash,
            blockNumber: block.number,
            severity: severity,
            addedCollateral: msg.value,
            timestamp: block.timestamp
        });

        actions.push(action);
        totalActions++;

        emit EmergencyCollateralAdded(user, txHash, msg.value, severity);
    }

    /// @notice Conductor bot adresini güncelle
    function setConductorBot(address newBot) external onlyOwner {
        conductorBot = newBot;
        emit ConductorBotUpdated(newBot);
    }

    /// @notice Son N aksiyonu getir
    function getRecentActions(uint256 count) external view returns (AlertAction[] memory) {
        uint256 len = actions.length;
        if (count > len) count = len;
        AlertAction[] memory recent = new AlertAction[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = actions[len - count + i];
        }
        return recent;
    }

    /// @notice Vault istatistikleri
    function getStats() external view returns (
        uint256 _totalActions,
        uint256 _vaultBalance,
        uint256 _lastActionTime
    ) {
        return (
            totalActions,
            address(this).balance,
            actions.length > 0 ? actions[actions.length - 1].timestamp : 0
        );
    }

    receive() external payable {}
}
