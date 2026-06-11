"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionStatus = void 0;
// This will replace any import from @prisma/client for CollectionStatus
var CollectionStatus;
(function (CollectionStatus) {
    CollectionStatus["PENDING"] = "PENDING";
    CollectionStatus["SCHEDULED"] = "SCHEDULED";
    CollectionStatus["COMPLETED"] = "COMPLETED";
    CollectionStatus["CANCELLED"] = "CANCELLED";
})(CollectionStatus || (exports.CollectionStatus = CollectionStatus = {}));
