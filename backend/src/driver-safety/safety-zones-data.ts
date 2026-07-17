/**
 * Global Safety Zones Database — Pre-configured hotspots for Africa + international.
 * Sources: SAPS crime statistics, ZRP reports, community reporting, insurance claim data.
 * 120+ zones across 7 countries. Tenants seed by their country setting.
 */

type ZoneData = { name: string; lat: number; lng: number; radiusM: number; riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; source: string };

// ═══════════════════════════════════════════════════════════════════════════════
// SOUTH AFRICA (55 zones) — SAPS top crime stations + N-route corridors
// ═══════════════════════════════════════════════════════════════════════════════

export const SAFETY_ZONES_ZA: ZoneData[] = [
  // ── Gauteng (CRITICAL) ──
  { name: 'Alexandra, JHB', lat: -26.1076, lng: 28.0897, radiusM: 2000, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Hillbrow, JHB', lat: -26.1875, lng: 28.0485, radiusM: 1500, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Johannesburg CBD', lat: -26.2041, lng: 28.0473, radiusM: 2000, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Berea, JHB', lat: -26.1930, lng: 28.0530, radiusM: 1200, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Yeoville, JHB', lat: -26.1812, lng: 28.0617, radiusM: 1000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  // ── Gauteng (HIGH) ──
  { name: 'Diepsloot', lat: -25.9318, lng: 28.0146, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Soweto (Orlando)', lat: -26.2485, lng: 27.8546, radiusM: 3000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Tembisa', lat: -26.0035, lng: 28.2270, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Katlehong', lat: -26.3385, lng: 28.1536, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Thokoza', lat: -26.3567, lng: 28.1478, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Orange Farm', lat: -26.4850, lng: 27.8650, radiusM: 3000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Eldorado Park', lat: -26.2933, lng: 27.9000, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Sunnyside, PTA', lat: -25.7561, lng: 28.2099, radiusM: 1500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Mamelodi, PTA', lat: -25.7200, lng: 28.3500, radiusM: 3000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Atteridgeville, PTA', lat: -25.7760, lng: 28.0816, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Hammanskraal', lat: -25.4028, lng: 28.2819, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },

  // ── Western Cape ──
  { name: 'Nyanga, CPT', lat: -33.9866, lng: 18.5656, radiusM: 2000, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Khayelitsha, CPT', lat: -34.0388, lng: 18.6819, radiusM: 3000, riskLevel: 'CRITICAL', source: 'SAPS_STATS' },
  { name: 'Mitchells Plain, CPT', lat: -34.0466, lng: 18.6211, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Philippi, CPT', lat: -34.0206, lng: 18.5847, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Gugulethu, CPT', lat: -33.9785, lng: 18.5659, radiusM: 1500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Delft, CPT', lat: -33.9674, lng: 18.6299, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Manenberg, CPT', lat: -33.9948, lng: 18.5619, radiusM: 1500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Bonteheuwel, CPT', lat: -33.9568, lng: 18.5557, radiusM: 1500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Cape Town CBD (Station area)', lat: -33.9249, lng: 18.4241, radiusM: 1000, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  // ── KwaZulu-Natal ──
  { name: 'Inanda, DBN', lat: -29.7340, lng: 30.9620, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'KwaMashu, DBN', lat: -29.7484, lng: 30.9780, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Umlazi, DBN', lat: -29.9635, lng: 30.8972, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Ntuzuma, DBN', lat: -29.7600, lng: 30.9500, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Durban Point/CBD', lat: -29.8587, lng: 31.0292, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  { name: 'Pinetown', lat: -29.8167, lng: 30.8667, radiusM: 2000, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  // ── Eastern Cape ──
  { name: 'Mthatha CBD', lat: -31.5889, lng: 28.7844, radiusM: 2000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'Port Elizabeth North End', lat: -33.9181, lng: 25.5701, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  { name: 'Mdantsane, EL', lat: -32.9631, lng: 27.7691, radiusM: 2500, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  // ── Free State / Limpopo / Mpumalanga ──
  { name: 'Bloemfontein CBD', lat: -29.1175, lng: 26.2143, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  { name: 'Polokwane CBD', lat: -23.9045, lng: 29.4688, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  { name: 'Nelspruit/Mbombela', lat: -25.4753, lng: 30.9694, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },
  { name: 'Witbank/eMalahleni CBD', lat: -25.8744, lng: 29.2339, radiusM: 1500, riskLevel: 'MEDIUM', source: 'SAPS_STATS' },

  // ── National Highway Corridors (truck hijacking hotspots) ──
  { name: 'N1 Buccleuch Interchange', lat: -26.0593, lng: 28.1030, radiusM: 800, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'N1 Johannesburg South (Southgate)', lat: -26.2789, lng: 27.9889, radiusM: 1500, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'N1 Kranskop Toll Plaza', lat: -24.4800, lng: 28.6300, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'N3 Mooi River Corridor', lat: -29.2106, lng: 29.9930, radiusM: 5000, riskLevel: 'HIGH', source: 'SAPS_STATS' },
  { name: 'N3 Van Reenen Pass', lat: -28.3750, lng: 29.3917, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'N3 Harrismith', lat: -28.2730, lng: 29.1270, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'N4 Platinum Highway (Rustenburg)', lat: -25.6737, lng: 27.2424, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'N12 Daveyton Interchange', lat: -26.1500, lng: 28.4000, radiusM: 1500, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'N2 KZN South Coast (Umzinto)', lat: -30.3167, lng: 30.6667, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'N2 Eastern Cape (Colchester)', lat: -33.6500, lng: 25.9500, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'R21 Olifantsfontein', lat: -25.9500, lng: 28.2333, radiusM: 1500, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'M1 South JHB (Booysens)', lat: -26.2300, lng: 28.0300, radiusM: 1000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Beitbridge Border (SA side)', lat: -22.2167, lng: 29.9833, radiusM: 3000, riskLevel: 'HIGH', source: 'COMMUNITY' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ZIMBABWE (22 zones) — ZRP reports + community intelligence
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_ZW: ZoneData[] = [
  // ── Harare ──
  { name: 'Harare CBD (Kopje area)', lat: -17.8292, lng: 31.0522, radiusM: 2000, riskLevel: 'HIGH', source: 'ZRP_STATS' },
  { name: 'Mbare, Harare', lat: -17.8600, lng: 31.0400, radiusM: 2500, riskLevel: 'CRITICAL', source: 'ZRP_STATS' },
  { name: 'Epworth, Harare', lat: -17.8900, lng: 31.1300, radiusM: 3000, riskLevel: 'HIGH', source: 'ZRP_STATS' },
  { name: 'Mufakose, Harare', lat: -17.8400, lng: 30.9700, radiusM: 2000, riskLevel: 'HIGH', source: 'ZRP_STATS' },
  { name: 'Highfield, Harare', lat: -17.8500, lng: 31.0100, radiusM: 2000, riskLevel: 'HIGH', source: 'ZRP_STATS' },
  { name: 'Glen Norah, Harare', lat: -17.8700, lng: 31.0000, radiusM: 2000, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  { name: 'Chitungwiza', lat: -18.0127, lng: 31.0756, radiusM: 3000, riskLevel: 'HIGH', source: 'ZRP_STATS' },

  // ── Bulawayo ──
  { name: 'Bulawayo CBD', lat: -20.1539, lng: 28.5833, radiusM: 2000, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  { name: 'Makokoba, Bulawayo', lat: -20.1600, lng: 28.5700, radiusM: 1500, riskLevel: 'HIGH', source: 'ZRP_STATS' },
  { name: 'Entumbane, Bulawayo', lat: -20.1800, lng: 28.5400, radiusM: 2000, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  // ── Other cities + corridors ──
  { name: 'Mutare CBD', lat: -18.9707, lng: 32.6709, radiusM: 1500, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  { name: 'Gweru CBD', lat: -19.4500, lng: 29.8167, radiusM: 1500, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  { name: 'Masvingo CBD', lat: -20.0622, lng: 30.8286, radiusM: 1500, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
  { name: 'Beitbridge Border (ZW side)', lat: -22.2167, lng: 29.9900, radiusM: 3000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Chirundu Border', lat: -15.7333, lng: 28.8500, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'A4 Highway (Harare-Mutare, Marondera)', lat: -18.1833, lng: 31.5500, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'A6 Highway (Harare-Chirundu corridor)', lat: -16.5000, lng: 29.5000, radiusM: 5000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Victoria Falls CBD', lat: -17.9244, lng: 25.8567, radiusM: 1500, riskLevel: 'LOW', source: 'COMMUNITY' },
  { name: 'Plumtree Border', lat: -20.4833, lng: 27.8167, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Norton', lat: -17.8833, lng: 30.7000, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Kwekwe CBD', lat: -18.9281, lng: 29.8147, radiusM: 1500, riskLevel: 'MEDIUM', source: 'ZRP_STATS' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// KENYA (15 zones) — NPS reports
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_KE: ZoneData[] = [
  { name: 'Eastleigh, Nairobi', lat: -1.2746, lng: 36.8542, radiusM: 2000, riskLevel: 'CRITICAL', source: 'NPS_STATS' },
  { name: 'Dandora, Nairobi', lat: -1.2500, lng: 36.8900, radiusM: 2500, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Mathare, Nairobi', lat: -1.2600, lng: 36.8600, radiusM: 2000, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Kibera, Nairobi', lat: -1.3133, lng: 36.7875, radiusM: 3000, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Nairobi CBD (River Road)', lat: -1.2833, lng: 36.8219, radiusM: 1000, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Kayole, Nairobi', lat: -1.2700, lng: 36.9100, radiusM: 2000, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Mukuru kwa Njenga', lat: -1.3100, lng: 36.8700, radiusM: 2000, riskLevel: 'MEDIUM', source: 'NPS_STATS' },
  { name: 'Mombasa Old Town', lat: -4.0435, lng: 39.6682, radiusM: 1500, riskLevel: 'MEDIUM', source: 'NPS_STATS' },
  { name: 'Likoni, Mombasa', lat: -4.0800, lng: 39.6600, radiusM: 2000, riskLevel: 'HIGH', source: 'NPS_STATS' },
  { name: 'Nakuru CBD', lat: -0.3031, lng: 36.0800, radiusM: 1500, riskLevel: 'MEDIUM', source: 'NPS_STATS' },
  { name: 'Kisumu Kondele', lat: -0.1050, lng: 34.7600, radiusM: 2000, riskLevel: 'MEDIUM', source: 'NPS_STATS' },
  { name: 'A2 Highway (Nairobi-Thika, Juja)', lat: -1.1000, lng: 37.0100, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'A109 Mombasa Road (Athi River)', lat: -1.4500, lng: 36.9800, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Eldoret CBD', lat: 0.5143, lng: 35.2698, radiusM: 1500, riskLevel: 'MEDIUM', source: 'NPS_STATS' },
  { name: 'Kitale', lat: 1.0157, lng: 35.0020, radiusM: 1500, riskLevel: 'LOW', source: 'NPS_STATS' },
];


// ═══════════════════════════════════════════════════════════════════════════════
// NIGERIA (15 zones) — NPF reports
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_NG: ZoneData[] = [
  { name: 'Lagos Island/Marina', lat: 6.4541, lng: 3.4082, radiusM: 2000, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Oshodi, Lagos', lat: 6.5569, lng: 3.3414, radiusM: 2000, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Mushin, Lagos', lat: 6.5323, lng: 3.3558, radiusM: 2000, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Ajegunle, Lagos', lat: 6.4500, lng: 3.3300, radiusM: 2500, riskLevel: 'CRITICAL', source: 'NPF_STATS' },
  { name: 'Ikorodu Road Corridor', lat: 6.5800, lng: 3.3900, radiusM: 3000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Mile 2, Lagos', lat: 6.4600, lng: 3.3100, radiusM: 1500, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Apapa Wharf Road', lat: 6.4400, lng: 3.3600, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Abuja Nyanya', lat: 8.9600, lng: 7.5900, radiusM: 2500, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Abuja Lugbe', lat: 8.9800, lng: 7.3900, radiusM: 2000, riskLevel: 'MEDIUM', source: 'NPF_STATS' },
  { name: 'Port Harcourt Diobu', lat: 4.7800, lng: 7.0100, radiusM: 2000, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Benin City Ring Road', lat: 6.3350, lng: 5.6200, radiusM: 2000, riskLevel: 'MEDIUM', source: 'NPF_STATS' },
  { name: 'Kano Sabon Gari', lat: 12.0000, lng: 8.5167, radiusM: 2000, riskLevel: 'HIGH', source: 'NPF_STATS' },
  { name: 'Lagos-Ibadan Expressway (Ogere)', lat: 6.8500, lng: 3.6000, radiusM: 5000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Ore-Benin Highway', lat: 6.7500, lng: 4.8800, radiusM: 5000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Enugu Coal Camp', lat: 6.4400, lng: 7.4900, radiusM: 2000, riskLevel: 'MEDIUM', source: 'NPF_STATS' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOZAMBIQUE (10 zones)
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_MZ: ZoneData[] = [
  { name: 'Maputo CBD (Baixa)', lat: -25.9692, lng: 32.5732, radiusM: 2000, riskLevel: 'HIGH', source: 'PRM_STATS' },
  { name: 'Matola', lat: -25.9622, lng: 32.4589, radiusM: 2500, riskLevel: 'HIGH', source: 'PRM_STATS' },
  { name: 'Chamanculo, Maputo', lat: -25.9800, lng: 32.5600, radiusM: 2000, riskLevel: 'HIGH', source: 'PRM_STATS' },
  { name: 'EN1 Maputo-Xai-Xai Corridor', lat: -24.5000, lng: 33.6000, radiusM: 5000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Beira CBD', lat: -19.8436, lng: 34.8389, radiusM: 2000, riskLevel: 'MEDIUM', source: 'PRM_STATS' },
  { name: 'Nampula CBD', lat: -15.1165, lng: 39.2666, radiusM: 1500, riskLevel: 'MEDIUM', source: 'PRM_STATS' },
  { name: 'EN1 Beira-Chimoio Corridor', lat: -19.5000, lng: 33.5000, radiusM: 5000, riskLevel: 'HIGH', source: 'COMMUNITY' },
  { name: 'Ressano Garcia Border', lat: -25.4167, lng: 31.9833, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Maxixe/Inhambane', lat: -23.8600, lng: 35.3800, radiusM: 1500, riskLevel: 'LOW', source: 'PRM_STATS' },
  { name: 'Nacala Port Road', lat: -14.5667, lng: 40.6833, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// GHANA (8 zones)
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_GH: ZoneData[] = [
  { name: 'Nima, Accra', lat: 5.5800, lng: -0.1900, radiusM: 2000, riskLevel: 'HIGH', source: 'GPS_STATS' },
  { name: 'James Town, Accra', lat: 5.5300, lng: -0.2100, radiusM: 1500, riskLevel: 'HIGH', source: 'GPS_STATS' },
  { name: 'Agbogbloshie, Accra', lat: 5.5500, lng: -0.2300, radiusM: 2000, riskLevel: 'HIGH', source: 'GPS_STATS' },
  { name: 'Tema Motorway (night)', lat: 5.6300, lng: -0.0100, radiusM: 3000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Kasoa Junction', lat: 5.5300, lng: -0.4200, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
  { name: 'Kumasi Adum', lat: 6.6885, lng: -1.6244, radiusM: 1500, riskLevel: 'MEDIUM', source: 'GPS_STATS' },
  { name: 'Takoradi Market Circle', lat: 4.8900, lng: -1.7600, radiusM: 1500, riskLevel: 'MEDIUM', source: 'GPS_STATS' },
  { name: 'N1 Accra-Kumasi (Suhum stretch)', lat: 6.0400, lng: -0.4500, radiusM: 4000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BOTSWANA (5 zones)
// ═══════════════════════════════════════════════════════════════════════════════
export const SAFETY_ZONES_BW: ZoneData[] = [
  { name: 'Gaborone CBD (Main Mall)', lat: -24.6541, lng: 25.9087, radiusM: 1500, riskLevel: 'MEDIUM', source: 'BPS_STATS' },
  { name: 'Old Naledi, Gaborone', lat: -24.6700, lng: 25.8900, radiusM: 2000, riskLevel: 'HIGH', source: 'BPS_STATS' },
  { name: 'Francistown CBD', lat: -21.1700, lng: 27.5100, radiusM: 1500, riskLevel: 'MEDIUM', source: 'BPS_STATS' },
  { name: 'A1 Trans-Kalahari (Ghanzi stretch)', lat: -21.7000, lng: 21.7000, radiusM: 5000, riskLevel: 'LOW', source: 'COMMUNITY' },
  { name: 'Kazungula Border', lat: -17.7900, lng: 25.2700, radiusM: 2000, riskLevel: 'MEDIUM', source: 'COMMUNITY' },
];
