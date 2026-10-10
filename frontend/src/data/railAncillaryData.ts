/** AUTO-GENERATED structure from sources/Annexure 40 - TRIM Ancillary Services Catalogue 2026_27 (1).pdf (round 68).
 * SHA-256 f924fc8e6086af61a76525f298da02ef270d41fddc703174934596a2285a55cf (6 pages).
 * Service names, descriptions and units of measure are verbatim (whitespace normalised).
 * The catalogue contains NO price/rate values — rates remain an external gap (E-TARIFF-01).
 * Source UOM "TBD" entries are preserved exactly (items 34, 40). */

export const ancillarySource = {
  file: "sources/Annexure 40 - TRIM Ancillary Services Catalogue 2026_27 (1).pdf",
  sha256: "f924fc8e6086af61a76525f298da02ef270d41fddc703174934596a2285a55cf",
  pages: 6,
  periodLabel: "2026/27",
  ratesStatus:
    "No price/rate values in the delivered catalogue. Annexure 40 defines services and units of measure only; approved ancillary tariff rates remain to be supplied (E-TARIFF-01 open).",
};

export interface AncillaryItem {
  name: string | null;
  description: string;
  uom: string;
}

export interface AncillaryGroup {
  n: number;
  name: string;
  items: AncillaryItem[];
}

export interface AncillaryTier {
  tier: string;
  title: string;
  groups: AncillaryGroup[];
}

export const ancillaryCatalogue: AncillaryTier[] = [
  {
    tier: "Tier 1",
    title:
      "Infrastructure Access Services – Safety critical and compulsory services essential for day-to-day train operations",
    groups: [
      {
        n: 1,
        name: "Yards: Shunting and marshalling services",
        items: [
          {
            name: "List of Yards.xlsx",
            description:
              "Provision of ancillary facilities services such as shunting, staging, inspections, assembling and dispatching trains, including the use of waiting rooms and ablution facilities TOC crews, where available.",
            uom: "Per wagon movement (varies per train category: GF <50 wagons; Medium heavy >50 <100; heavy >100)",
          },
        ],
      },
      {
        n: 2,
        name: "Inland terminals: Handling of containerized cargo for modal transfers from road to rail",
        items: [
          {
            name: "List of Terminals.xlsx",
            description:
              "Provision of containerized cargo handling and modal transfers services at TRIM owned inland terminals. Fee includes access to and use of waiting rooms and ablution facilities where available",
            uom: "Per container handled",
          },
        ],
      },
      {
        n: 3,
        name: "Radio network (Trunk & Open Channel): Radio support services for compulsory onboard train communications",
        items: [
          {
            name: null,
            description:
              "Managed access to TRIM radio network services, including agreed user access, radio subscription packages and service availability support where applicable.",
            uom: "Per Radio (monthly subscription))",
          },
        ],
      },
      {
        n: 4,
        name: "Radio Network Supporting Peripherals (Train Radios, Handheld Radios, Telemeters, Radio Cab Systems, incl. Integrated Onboard Operating System)",
        items: [
          {
            name: "Radio & Telemeter Compliance Testing and Acceptance Support",
            description:
              "Batch compliance testing, configuration checks and acceptance testing of TOC radios to verify technical compliance and compatibility with the TRIM radio network.",
            uom: "Per Device",
          },
          {
            name: "Radio & Telemeter Programming and Configuration Support",
            description:
              "Technical support for radio programming, code plug control, configuration checks and approved user profiles.",
            uom: "Per Device",
          },
          {
            name: "TOC Radio Onboarding and Activation",
            description:
              "Registration, configuration verification, subscriber activation and controlled connection of TOC radios to the TRIM radio network.",
            uom: "Per radio",
          },
          {
            name: "Train Radio Box and locomotive handset installation and commissioning",
            description:
              "Installation, interface verification, antenna and power checks, functional testing and operational acceptance of approved RTB and locomotive radio handset equipment.",
            uom: "Per locomotive",
          },
        ],
      },
    ],
  },
  {
    tier: "Tier 2",
    title:
      "Rail Critical Support Services – Safety Critical Services for rail operations but non-compulsory for day to day running of trains",
    groups: [
      {
        n: 5,
        name: "Track and trace data",
        items: [
          {
            name: null,
            description:
              "Provision of real-time location and movement tracking services for TOC rolling stock through TRIM’s Vehicle Identification System (VIS) and CS90 platforms",
            uom: "Per month",
          },
        ],
      },
      {
        n: 6,
        name: "Rolling stock condition data",
        items: [
          {
            name: null,
            description:
              "Provision of condition monitoring data from TRIM’s wayside systems (Wheel Profile Monitor, Acoustic Bearing Evaluator, Weigh-in-Motion, etc.) for TOC rolling stock maintenance planning purposes",
            uom: "Per month",
          },
        ],
      },
      {
        n: 7,
        name: "Locomotive pantograph monitoring data",
        items: [
          {
            name: null,
            description:
              "Access to data from continuous monitoring and assessment of TOC's locomotive pantographs to ensure safe interaction with overhead traction equipment (OHTE)",
            uom: "Per loco per month",
          },
        ],
      },
      {
        n: 8,
        name: "Evaluation of new rolling stock",
        items: [
          {
            name: null,
            description:
              "Comprehensive assessment of new locomotives or wagons to determine safety and technical compatibility on TRIM network",
            uom: "Per certificate (certificate for each wagon / loco)",
          },
        ],
      },
    ],
  },
  {
    tier: "Tier 3",
    title:
      "Optional Rail Support Services – Engineering and Technical support services for the development and maintenance of rail infrastructure",
    groups: [
      {
        n: 9,
        name: "Engineering and technical reviews of rail related project proposals",
        items: [
          {
            name: null,
            description:
              "Review and validation of external rail infrastructure designs and technologies - Private sidings, private or concessioned rail lines, substations, new operating philosophies",
            uom: "Per hour",
          },
        ],
      },
      {
        n: 10,
        name: "Weigh bridge calibration test train rental(wagons)",
        items: [
          { name: null, description: "Rental of weigh bridge calibration test train (wagons)", uom: "Per wagon per hour" },
        ],
      },
      {
        n: 11,
        name: "Business case reviews and support",
        items: [
          {
            name: null,
            description:
              "Provision of professional support to develop, assess, and validate business cases for rail-related projects",
            uom: "Per hour",
          },
        ],
      },
      {
        n: 12,
        name: "Weigh bridge repair, calibration and validation",
        items: [
          {
            name: null,
            description:
              "Technical services for calibration, repair and certification of private sidings weighbridges to ensure accuracy and compliance with national standards",
            uom: "Per certificate (1 certificate per weighbridge)",
          },
        ],
      },
      {
        n: 13,
        name: "Rail construction consultancy",
        items: [
          {
            name: null,
            description: "Provision of pre-construction support services for third-party rail projects",
            uom: "Per hour",
          },
        ],
      },
      {
        n: 14,
        name: "Rail infrastructure specifications",
        items: [
          {
            name: null,
            description:
              "Provision of access to TRIM's standardized rail infrastructure technical specifications (track, signalling, telecoms, yards, depots, etc.) for use by industry participants, contractors, and concessionaires",
            uom: "Subscription Per annum (Fee covers all revisions in that year)",
          },
        ],
      },
      {
        n: 15,
        name: "Private siding inspections",
        items: [
          {
            name: null,
            description: "Inspections of private sidings to ensure safety and operational compliance",
            uom: "Per inspection",
          },
        ],
      },
      {
        n: 16,
        name: "Applications for new or upgraded level crossings",
        items: [
          {
            name: null,
            description:
              "Processing and engineering reviews of level crossing applications for upgrades or new developments",
            uom: "Per application",
          },
        ],
      },
      {
        n: 17,
        name: "Quality assurance, testing and commissioning",
        items: [
          {
            name: null,
            description: "Specialist testing and commissioning of rail infrastructure and equipment",
            uom: "Per certificate",
          },
        ],
      },
      {
        n: 18,
        name: "Rental of cabooses",
        items: [
          { name: null, description: "Rental of TRIM cabooses to TOC’s and third parties", uom: "Per caboose / day" },
        ],
      },
      {
        n: 19,
        name: "Electrical network capacity analysis",
        items: [
          {
            name: null,
            description: "Electrical network planning, conducting capacity and electrical performance simulations",
            uom: "Per request",
          },
        ],
      },
      {
        n: 20,
        name: "Electrical protection review and issuing settings",
        items: [
          {
            name: null,
            description: "Conducting electrical protection analysis and issuing protection settings",
            uom: "Per application",
          },
        ],
      },
      {
        n: 21,
        name: "OHTE mechanized condition assessments",
        items: [
          { name: null, description: "Conducting mechanized condition assessments of OHTE", uom: "Per run" },
        ],
      },
      {
        n: 22,
        name: "Technical investigations",
        items: [{ name: null, description: "Investigation of failures", uom: "Per request" }],
      },
      {
        n: 23,
        name: "Pantograph and roof equipment inspection",
        items: [
          {
            name: null,
            description: "Inspecting electrical locomotive pantograph and roof equipment",
            uom: "Per locomotive",
          },
        ],
      },
      {
        n: 24,
        name: "Electrical energy performance analysis",
        items: [
          {
            name: null,
            description: "Provision of electrical energy performance analysis for locomotives and buildings",
            uom: "Per request",
          },
        ],
      },
      {
        n: 25,
        name: "Electrical Systems and Technology Audits",
        items: [
          {
            name: null,
            description:
              "Auditing of electrical equipment, systems and technology to determine useful lifecycle and asset value.",
            uom: "Per request",
          },
        ],
      },
    ],
  },
  {
    tier: "Tier 4",
    title:
      "Non Rail Service – Telecoms, Property and safety & emergency services outside rail operations",
    groups: [
      {
        n: 26,
        name: "Unlit dark optic fiber National Long Distance (50 - 1000km)",
        items: [
          {
            name: "Installation of dark optical fibre cables NLD (50 - 1000km) for Leasing.",
            description: "Installation of dark optical fibre cables NLD (50 - 1000km) for Leasing.",
            uom: "Per installation (once off)",
          },
          {
            name: "Leasing of dark optical fibre cables NLD (50 - 1000km)",
            description: "Leasing of dark optical fibre cables NLD (50 - 1000km)",
            uom: "Per month (usage)",
          },
          {
            name: "Maintenance of leased fibre links to ensure operational integrity (NLD) 50 - 1000km",
            description: "Maintenance of leased fibre links to ensure operational integrity (NLD) 50 - 1000km",
            uom: "Per km / month",
          },
        ],
      },
      {
        n: 27,
        name: "Dark optic fibre Metro (0 - 50km)",
        items: [
          {
            name: "Installation of dark optical fibre cables (Metro) 0 - 50km for leasing",
            description: "Installation of dark optical fibre cables (Metro) 0 - 50km for leasing",
            uom: "Per installation (once off)",
          },
          {
            name: "Leasing of dark optical fibre cables (Metro) 0 - 50km for leasing",
            description: "Leasing of dark optical fibre cables (Metro) 0 - 50km for leasing",
            uom: "Per month (usage)",
          },
          {
            name: "Maintenance of leased fibre links to ensure operational integrity (Metro) 0 - 50km",
            description: "Maintenance of leased fibre links to ensure operational integrity (Metro) 0 - 50km",
            uom: "Per km / month",
          },
          {
            name: "Installation of Transmission links: Digital transmission link with a capacity of 2.048 Mbps (E1)",
            description: "Installation of Transmission links: Digital transmission link with a capacity of 2.048 Mbps (E1)",
            uom: "Per Month (usage)",
          },
          {
            name: "Synchronous Transport Module level 1 (STM-1) 155.52 Mbps",
            description: "Synchronous Transport Module level 1 (STM-1) 155.52 Mbps",
            uom: "Per Month (usage)",
          },
          {
            name: "Synchronous Transport Module level 1 (STM-4) 622.080 Mbit/s or 622 Mbps",
            description: "Synchronous Transport Module level 1 (STM-4) 622.080 Mbit/s or 622 Mbps",
            uom: "Per Month (usage)",
          },
          {
            name: "Synchronous Transport Module level 1 (STM-16) 2.5 gigabits per second (2,488.320 Mbit/s)",
            description: "Synchronous Transport Module level 1 (STM-16) 2.5 gigabits per second (2,488.320 Mbit/s)",
            uom: "Per Month (usage)",
          },
          {
            name: "Synchronous Transport Module level 1 (STM-64) 10 Gigabits per second (10 Gbps)",
            description: "Synchronous Transport Module level 1 (STM-64) 10 Gigabits per second (10 Gbps)",
            uom: "Per Month (usage)",
          },
          {
            name: "Installation of any single transmission link from the list above",
            description: "Installation of any single transmission link from the list above",
            uom: "Per link (Once off)",
          },
          {
            name: "Data Transmission Speed packages: 1 Gbps",
            description: "Data Transmission Speed packages: 1 Gbps",
            uom: "Per month",
          },
          {
            name: "Data Transmission Speed packages: 2,5 Gbps",
            description: "Data Transmission Speed packages: 2,5 Gbps",
            uom: "Per month",
          },
          {
            name: "Data Transmission Speed packages: 5 Gbps",
            description: "Data Transmission Speed packages: 5 Gbps",
            uom: "Per month",
          },
          {
            name: "Data Transmission Speed packages: 10 Gbps",
            description: "Data Transmission Speed packages: 10 Gbps",
            uom: "Per month",
          },
        ],
      },
      {
        n: 28,
        name: "Dark fibre support services - real estate: Rental of physical space for telecoms equipment",
        items: [
          { name: "Space in Comms Room 3 X 3", description: "Space in Comms Room 3 X 3", uom: "Per room / month" },
          { name: "Utilities (electricity) MRC", description: "Utilities (electricity) MRC", uom: "Per room / month" },
          { name: "Site Access", description: "Site Access", uom: "Per site visit" },
        ],
      },
      {
        n: 29,
        name: "Installation of non-TRIM optic fibre cables",
        items: [
          { name: "Underground Fiber installation", description: "Underground Fiber installation", uom: "Per meter" },
          { name: "Overhead Fiber installation", description: "Overhead Fiber installation", uom: "Per meter" },
        ],
      },
      {
        n: 30,
        name: "Radio & Wireless Communication Services",
        items: [
          {
            name: "Enterprise and non-rail radio network access",
            description:
              "Managed access and subscription to available TRIM radio network services for approved users outside compulsory train communication arrangements.",
            uom: "Per radio / month",
          },
          {
            name: "UHF / VHF fixed base station and repeater deployment",
            description:
              "Supply, installation, configuration and commissioning of approved fixed base stations, standalone repeaters and local coverage systems.",
            uom: "Per site / project",
          },
          {
            name: "UHF / VHF handheld and mobile radio service",
            description:
              "Supply, configuration, commissioning and support of approved handheld, vehicle-mounted and mobile radios for operational users.",
            uom: "Per unit",
          },
          {
            name: "Intrinsically safe radio service",
            description:
              "Supply, configuration and commissioning of approved intrinsically safe UHF or VHF radios for hazardous and controlled environments.",
            uom: "Per unit",
          },
          {
            name: "Marine VHF communication service",
            description:
              "Supply, installation, configuration and support of approved marine VHF fixed, handheld and mobile radio equipment for harbour and vessel operations.",
            uom: "Per unit / site",
          },
          {
            name: "Radio high-site co-location service",
            description:
              "Approved hosting of customer radio or telecommunications equipment, antennas and backhaul at TRIM high sites, subject to space, RF, structural, security and access approval.",
            uom: "Per site / month",
          },
          {
            name: "Port terminal wireless and Navis connectivity support",
            description:
              "Wireless access, coverage assurance and network fault support for approved terminal devices and Navis application connectivity, excluding ownership of the Navis application.",
            uom: "Per terminal / month",
          },
          {
            name: "Managed Wi-Fi, access point, controller, wireless gateway and associated backhaul services for port operational areas and modern mobile terminals.",
            description:
              "Managed Wi-Fi, access point, controller, wireless gateway and associated backhaul services for port operational areas and modern mobile terminals.",
            uom: "Per access point / site / month",
          },
          {
            name: "Narrowband wireless gateway and repeater support for TOC port operations",
            description:
              "Configuration, coverage assurance and fault support for approved legacy wireless gateways and repeaters serving TOC terminal devices in port operational areas.",
            uom: "Per gateway or repeater / month",
          },
        ],
      },
      {
        n: 31,
        name: "Transmission & Data Connectivity Services",
        items: [
          {
            name: "Dedicated wavelength service",
            description:
              "Dedicated optical wavelength delivered over available DWDM infrastructure, with optional route protection and capacities such as 10G, 100G or 400G.",
            uom: "Per wavelength / month",
          },
          {
            name: "Managed wavelength service",
            description:
              "Managed optical transport with monitoring, protection options and defined service levels for high-capacity customer applications.",
            uom: "Per wavelength / month",
          },
          {
            name: "DWDM / OTN managed transport service",
            description:
              "Managed optical transport with grooming, protection switching, performance monitoring and high-capacity backbone connectivity.",
            uom: "Per link / month",
          },
          {
            name: "Carrier Ethernet service (E-Line / E-LAN)",
            description:
              "Layer 2 metro or long-haul Ethernet connectivity with agreed committed and excess information rates.",
            uom: "Per link / month",
          },
          {
            name: "MPLS / IP VPN service",
            description:
              "Private Layer 3 IP connectivity with QoS, traffic separation and enterprise or operational service levels.",
            uom: "Per site / month",
          },
          {
            name: "Microwave radio link service",
            description:
              "Licensed or unlicensed microwave access and backhaul, including path design, equipment installation, alignment and optional managed support.",
            uom: "Per link once off / month",
          },
          {
            name: "Satellite backhaul service",
            description:
              "LEO or MEO satellite connectivity for remote operations, temporary sites, disaster recovery and emergency communications.",
            uom: "Per terminal once off plus subscription",
          },
          {
            name: "Legacy access network service",
            description:
              "Provision and maintenance of E1, E&M, FXO, FXS and V.24 interfaces for legacy rail, industrial and voice-grade applications.",
            uom: "Per port / link / month",
          },
        ],
      },
      {
        n: 32,
        name: "Telecommunication Facilities & Infrastructure Services",
        items: [
          {
            name: "Telecommunications room, rack and outdoor co-location",
            description:
              "Secure room, rack, floor or outdoor space for approved customer telecommunications equipment at available TRIM facilities.",
            uom: "Per rack / room / m² / month",
          },
          {
            name: "AC / DC power and battery-backup service",
            description:
              "Provision of metered AC power, DC rectifier capacity and optional battery backup for approved co-located telecommunications equipment.",
            uom: "Per connection / month or metered usage",
          },
          {
            name: "Telecommunications site access service",
            description:
              "Controlled site access for authorised customer or service-provider personnel to inspect, install or maintain approved equipment.",
            uom: "Per site visit",
          },
        ],
      },
      {
        n: 33,
        name: "Ad Hoc Installations",
        items: [
          {
            name: "Lan Point Installations",
            description: "Connectivity for ICT peripherals (Computers, network devices, WIFI access points, etc.)",
            uom: "Per Site",
          },
          {
            name: "CCTV Installations",
            description: "Installation of CCTV equipment for IP cameras, network video recorders",
            uom: "Per Site",
          },
        ],
      },
      {
        n: 34,
        name: "Future Digital Telecommunication Services",
        items: [
          {
            name: "DMR network access service",
            description:
              "Future DMR Tier II operational voice service supporting group calls, digital migration and approved mission-critical rail communication use cases.",
            uom: "TBD",
          },
          {
            name: "LTE broadband and MCPTT service",
            description:
              "Future LTE service supporting operational broadband, data, video, IoT and mission-critical push-to-talk applications.",
            uom: "TBD",
          },
          {
            name: "LTE and DMR hybrid interworking service",
            description:
              "Future dual-infrastructure service combining LTE broadband and DMR voice coverage for approved operational use cases.",
            uom: "TBD",
          },
        ],
      },
      {
        n: 35,
        name: "Emergency response services to fire, chemicals spills, derailments and other emergencies.",
        items: [
          { name: "Use of specialist vehicle", description: "Use of specialist vehicle", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Use of Fire Engine 3500 litres", description: "Use of Fire Engine 3500 litres", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Use of Water tanker", description: "Use of Water tanker", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Use of Grass unit", description: "Use of Grass unit", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Use of Incident Command vehicle / response vehicle", description: "Use of Incident Command vehicle / response vehicle", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Use of First response vehicle", description: "Use of First response vehicle", uom: "Per call-out (first 30mnts); Per vehicle per hour" },
          { name: "Decanting spade pump", description: "Use of specialized fire equipment - Decanting spade pump", uom: "Per unit" },
          { name: "Decanting Hetz pump", description: "Use of specialized fire equipment - Decanting Hetz pump", uom: "Per unit" },
          { name: "Fire extinguishers (dcp)", description: "Use of specialized fire equipment - Fire extinguishers (dcp)", uom: "Per extinguisher" },
          { name: "Alco foam concentrates", description: "Use of specialized fire equipment - Alco foam concentrates", uom: "Per litre" },
          { name: "Oil cap", description: "Use of specialized fire equipment - Oil cap", uom: "Per litre" },
          { name: "Spillsorb", description: "Use of specialized fire equipment - Spillsorb", uom: "Per 10 kg bag" },
          { name: "Splash suite", description: "Use of specialized fire equipment - Splash suite", uom: "Per suit" },
          { name: "Scba - Self-Contained Breathing Apparatus", description: "Use of specialized fire equipment - Scba - Self-Contained Breathing Apparatus", uom: "Per unit" },
          { name: "Labour - Chief Fire Officer.", description: "Specialized Labour - Labour - Chief Fire Officer.", uom: "Per hour" },
          { name: "Labour - Senior Fire Officer.", description: "Specialized Labour - Labour - Senior Fire Officer.", uom: "Per hour" },
          { name: "Labour - Fire Officer.", description: "Specialized Labour - Labour - Fire Officer.", uom: "Per hour" },
          { name: "Labour - Fire Fighter.", description: "Specialized Labour - Labour - Fire Fighter.", uom: "Per hour" },
          { name: "Water used.", description: "Specialized Labour - Water used.", uom: "Per kl" },
        ],
      },
      {
        n: 36,
        name: "Fire equipment maintenance services",
        items: [
          { name: "Maintenance of 4,5 kg DCP Fire Extinguisher", description: "Maintenance of 4,5 kg DCP Fire Extinguisher", uom: "Per extinguisher" },
          { name: "Maintenance of 9 kg DCP Fire Extinguisher", description: "Maintenance of 9 kg DCP Fire Extinguisher", uom: "Per extinguisher" },
          { name: "Maintenance of 5 kg Co2 Fire Extinguisher", description: "Maintenance of 5 kg Co2 Fire Extinguisher", uom: "Per extinguisher" },
          { name: "Maintenance of 9 kg Water Fire Extinguisher", description: "Maintenance of 9 kg Water Fire Extinguisher", uom: "Per extinguisher" },
          { name: "Maintenance of 9 kg Foam Water Fire Extinguishers", description: "Maintenance of 9 kg Foam Water Fire Extinguishers", uom: "Per extinguisher" },
          { name: "Maintenance of Fire Hose Reels", description: "Maintenance of Fire Hose Reels", uom: "Per reel" },
          { name: "Maintenance of Fire Hydrants", description: "Maintenance of Fire Hydrants", uom: "Per hydrant" },
        ],
      },
      {
        n: 37,
        name: "Fire equipment and escape signages supply services",
        items: [
          {
            name: "Supply of Fire equipment Signages (Pair - item and Arrow)",
            description: "Supply of Fire equipment Signages (Pair - item and Arrow)",
            uom: "Per pair",
          },
          {
            name: "Supply and installation of escape signages (Pair - item and Arrow)",
            description: "Supply and installation of escape signages (Pair - item and Arrow)",
            uom: "Per pair",
          },
        ],
      },
      {
        n: 38,
        name: "Technical support services: Provision of fire prevention support services and training equipment.",
        items: [
          { name: "Provision of Fire Risk Assessment", description: "Provision of Fire Risk Assessment", uom: "Per assessment" },
          { name: "On site evacuation drills / Simulations and feedback", description: "On site evacuation drills / Simulations and feedback", uom: "Per drill / simulation" },
          { name: "Rail Route Risk Assessment/ Profiling", description: "Rail Route Risk Assessment/ Profiling", uom: "Per site" },
          { name: "Lecture rooms etc. per day or part thereof", description: "Lecture rooms etc. per day or part thereof", uom: "Per room Per day" },
          {
            name: "Fire training grounds, drill yard, equipment and props etc. for practical fire training/ drills and demonstrations per day or part thereof NEW",
            description:
              "Fire training grounds, drill yard, equipment and props etc. for practical fire training/ drills and demonstrations per day or part thereof NEW",
            uom: "Per day / per hour",
          },
        ],
      },
      {
        n: 39,
        name: "Access to wayleaves",
        items: [
          {
            name: null,
            description: "Processing and review of wayleave applications on or through TRIM infrastructure",
            uom: "Per application",
          },
        ],
      },
      {
        n: 40,
        name: "Staging",
        items: [
          {
            name: null,
            description:
              "Leasing of underutilised rail lines within stations and yards for the temporary staging, parking, or idling of trains and rolling stock.",
            uom: "TBD",
          },
        ],
      },
    ],
  },
];

export const ancillaryCounts = {
  tiers: 4,
  groups: 40,
  items: ancillaryCatalogue.reduce((n, t) => n + t.groups.reduce((m, g) => m + g.items.length, 0), 0),
};
