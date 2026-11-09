/**
 * Starter set of real HS 2022 six-digit subheadings, chosen to cover the demo
 * shipments plus common UAE import categories. Phase 6 expands this to 300+
 * entries and adds embeddings for semantic search.
 *
 * dutyRateBp is an INDICATIVE GCC Common Customs Tariff rate for demo purposes
 * (most goods 5%; many staple foods 0%; tobacco and alcohol much higher).
 * It is not customs advice. `restricted` marks goods that need permits or are
 * controlled in the UAE.
 */
export type HsSeed = { code: string; description: string; dutyRateBp: number; restricted?: boolean }

export const HS_CODES: HsSeed[] = [
  // Food & agriculture
  { code: '080390', description: 'Bananas, fresh or dried (other than plantains)', dutyRateBp: 0 },
  { code: '090121', description: 'Coffee, roasted, not decaffeinated', dutyRateBp: 0 },
  { code: '090230', description: 'Black tea, fermented, in immediate packings of 3 kg or less', dutyRateBp: 0 },
  { code: '100630', description: 'Rice, semi-milled or wholly milled, whether or not polished or glazed', dutyRateBp: 0 },
  { code: '170199', description: 'Cane or beet sugar, solid, other than raw sugar without added flavouring', dutyRateBp: 0 },
  { code: '220110', description: 'Mineral waters and aerated waters, not sweetened or flavoured', dutyRateBp: 500 },
  { code: '220300', description: 'Beer made from malt', dutyRateBp: 5000, restricted: true },
  { code: '240220', description: 'Cigarettes containing tobacco', dutyRateBp: 10000, restricted: true },

  // Chemicals, plastics, rubber
  { code: '271019', description: 'Petroleum oils (not crude) and preparations, other than light oils, e.g. lubricating oils', dutyRateBp: 500 },
  { code: '300490', description: 'Medicaments in measured doses or packed for retail sale, other', dutyRateBp: 0, restricted: true },
  { code: '330499', description: 'Beauty, make-up and skin-care preparations, other', dutyRateBp: 500 },
  { code: '380891', description: 'Insecticides, put up for retail sale or as preparations', dutyRateBp: 500, restricted: true },
  { code: '392330', description: 'Carboys, bottles, flasks and similar articles of plastics', dutyRateBp: 500 },
  { code: '392690', description: 'Other articles of plastics', dutyRateBp: 500 },
  { code: '401110', description: 'New pneumatic tyres of rubber, of a kind used on motor cars', dutyRateBp: 500 },
  { code: '401693', description: 'Gaskets, washers and other seals of vulcanised rubber (other than hard rubber)', dutyRateBp: 500 },

  // Textiles & footwear
  { code: '610910', description: 'T-shirts, singlets and other vests of cotton, knitted or crocheted', dutyRateBp: 500 },
  { code: '620342', description: "Men's or boys' trousers, breeches and shorts of cotton, not knitted", dutyRateBp: 500 },
  { code: '640399', description: 'Footwear with outer soles of rubber/plastics/leather and uppers of leather, other', dutyRateBp: 500 },

  // Metals
  { code: '730890', description: 'Structures and parts of structures of iron or steel, other', dutyRateBp: 500 },
  { code: '731815', description: 'Threaded screws and bolts of iron or steel, other, whether or not with nuts or washers', dutyRateBp: 500 },
  { code: '732690', description: 'Other articles of iron or steel', dutyRateBp: 500 },
  { code: '760110', description: 'Aluminium, unwrought, not alloyed', dutyRateBp: 500 },

  // Machinery & mechanical
  { code: '841221', description: 'Hydraulic power engines and motors, linear acting (cylinders)', dutyRateBp: 500 },
  { code: '841350', description: 'Reciprocating positive displacement pumps for liquids, other', dutyRateBp: 500 },
  { code: '841360', description: 'Rotary positive displacement pumps for liquids, other', dutyRateBp: 500 },
  { code: '841391', description: 'Parts of pumps for liquids', dutyRateBp: 500 },
  { code: '841510', description: 'Air conditioning machines of a kind designed to be fixed to a window, wall, ceiling or floor', dutyRateBp: 500 },
  { code: '841810', description: 'Combined refrigerator-freezers, fitted with separate external doors', dutyRateBp: 500 },
  { code: '843149', description: 'Parts of cranes, bulldozers, excavators and similar machinery, other', dutyRateBp: 500 },
  { code: '847130', description: 'Portable automatic data processing machines weighing not more than 10 kg (laptops)', dutyRateBp: 0 },
  { code: '844332', description: 'Printers, copying machines and facsimile machines capable of connecting to a computer or network', dutyRateBp: 0 },
  { code: '848180', description: 'Taps, cocks, valves and similar appliances for pipes, boiler shells, tanks or vats, other', dutyRateBp: 500 },
  { code: '848190', description: 'Parts of taps, cocks, valves and similar appliances', dutyRateBp: 500 },
  { code: '848210', description: 'Ball bearings', dutyRateBp: 500 },
  { code: '848410', description: 'Gaskets and similar joints of metal sheeting combined with other material', dutyRateBp: 500 },

  // Electrical & electronics
  { code: '850440', description: 'Static converters (e.g. rectifiers, inverters, power supplies)', dutyRateBp: 500 },
  { code: '850760', description: 'Lithium-ion accumulators (batteries)', dutyRateBp: 500 },
  { code: '851713', description: 'Smartphones', dutyRateBp: 0 },
  { code: '852872', description: 'Television reception apparatus, other, colour', dutyRateBp: 500 },
  { code: '853669', description: 'Plugs and sockets for a voltage not exceeding 1,000 V, other', dutyRateBp: 500 },
  { code: '854143', description: 'Photovoltaic cells assembled in modules or made up into panels', dutyRateBp: 0 },
  { code: '854449', description: 'Electric conductors for a voltage not exceeding 1,000 V, not fitted with connectors, other', dutyRateBp: 500 },

  // Vehicles
  { code: '870380', description: 'Motor cars and other vehicles with only an electric motor for propulsion', dutyRateBp: 500 },
  { code: '870830', description: 'Brakes and servo-brakes and parts thereof, for motor vehicles', dutyRateBp: 500 },
  { code: '870899', description: 'Parts and accessories of motor vehicles, other', dutyRateBp: 500 },

  // Instruments, furniture, arms
  { code: '901890', description: 'Instruments and appliances used in medical, surgical or veterinary sciences, other', dutyRateBp: 0, restricted: true },
  { code: '930320', description: 'Sporting, hunting or target-shooting shotguns', dutyRateBp: 500, restricted: true },
  { code: '940161', description: 'Seats with wooden frames, upholstered', dutyRateBp: 500 },
  { code: '940330', description: 'Wooden furniture of a kind used in offices', dutyRateBp: 500 },
  { code: '940360', description: 'Other wooden furniture', dutyRateBp: 500 },
]
