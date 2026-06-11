"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCompanySocket = useCompanySocket;
const socket_io_client_1 = require("socket.io-client");
function useCompanySocket(url) {
    return (0, socket_io_client_1.io)(url, { transports: ['websocket'] });
}
