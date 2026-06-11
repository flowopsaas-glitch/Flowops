"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuoteStatus = exports.DriverStatus = exports.UserRole = exports.CollectionStatus = void 0;
var CollectionStatus;
(function (CollectionStatus) {
    CollectionStatus["PENDING"] = "PENDING";
    CollectionStatus["APPROVED"] = "APPROVED";
    CollectionStatus["ACKNOWLEDGED"] = "ACKNOWLEDGED";
    CollectionStatus["SCHEDULED"] = "SCHEDULED";
})(CollectionStatus || (exports.CollectionStatus = CollectionStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["COMPANY_ADMIN"] = "COMPANY_ADMIN";
    UserRole["OPERATOR"] = "OPERATOR";
    UserRole["DRIVER"] = "DRIVER";
})(UserRole || (exports.UserRole = UserRole = {}));
var DriverStatus;
(function (DriverStatus) {
    DriverStatus["AVAILABLE"] = "AVAILABLE";
    DriverStatus["BUSY"] = "BUSY";
    DriverStatus["OFFLINE"] = "OFFLINE";
})(DriverStatus || (exports.DriverStatus = DriverStatus = {}));
var QuoteStatus;
(function (QuoteStatus) {
    QuoteStatus["PENDING"] = "PENDING";
    QuoteStatus["APPROVED"] = "APPROVED";
})(QuoteStatus || (exports.QuoteStatus = QuoteStatus = {}));
