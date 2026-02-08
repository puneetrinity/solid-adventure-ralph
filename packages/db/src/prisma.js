"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
const client_1 = require("@prisma/client");
let prisma;
function getPrisma() {
    if (!prisma)
        prisma = new client_1.PrismaClient();
    return prisma;
}
//# sourceMappingURL=prisma.js.map