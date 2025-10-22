/**
 * BOM (Bill of Materials) Generator Service
 * Intelligently categorizes components and suggests vendors
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface ComponentVendor {
  vendor: string;
  partNumber: string;
  logoUrl: string;
  productUrl: string;
  description?: string;
}

export interface BOMComponent {
  componentId: string;
  componentName: string;
  componentType: string;
  category: string;
  description?: string;
  suggestedVendors: ComponentVendor[];
}

export interface BOMCategory {
  categoryName: string;
  categoryDescription: string;
  components: BOMComponent[];
}

export interface BOMReport {
  projectId: string;
  projectName: string;
  generatedAt: Date;
  categories: BOMCategory[];
  totalComponents: number;
}

// Known vendor logo URLs (can be extended)
const VENDOR_LOGOS: Record<string, string> = {
  'ARM': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Arm_logo_blue_150LG.png/320px-Arm_logo_blue_150LG.png',
  'Intel': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Intel_logo_%282006-2020%29.svg/320px-Intel_logo_%282006-2020%29.svg.png',
  'AMD': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/AMD_Logo.svg/320px-AMD_Logo.svg.png',
  'NVIDIA': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/NVIDIA_logo.svg/320px-NVIDIA_logo.svg.png',
  'Xilinx': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Xilinx_logo.svg/320px-Xilinx_logo.svg.png',
  'Altera': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Altera_logo.svg/320px-Altera_logo.svg.png',
  'Qualcomm': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Qualcomm-Logo.svg/320px-Qualcomm-Logo.svg.png',
  'Broadcom': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Broadcom_Corporation_logo_%28alternate%29.svg/320px-Broadcom_Corporation_logo_%28alternate%29.svg.png',
  'Marvell': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Marvell_logo.svg/320px-Marvell_logo.svg.png',
  'Texas Instruments': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Texas_Instruments_Logo.svg/320px-Texas_Instruments_Logo.svg.png',
  'TI': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Texas_Instruments_Logo.svg/320px-Texas_Instruments_Logo.svg.png',
  'NXP': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/NXP_Semiconductors_logo.svg/320px-NXP_Semiconductors_logo.svg.png',
  'STMicroelectronics': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/STMicroelectronics_Logo.svg/320px-STMicroelectronics_Logo.svg.png',
  'ST': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/STMicroelectronics_Logo.svg/320px-STMicroelectronics_Logo.svg.png',
  'Infineon': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Infineon-Logo.svg/320px-Infineon-Logo.svg.png',
  'Renesas': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Renesas_Electronics_logo.svg/320px-Renesas_Electronics_logo.svg.png',
  'Microchip': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Microchip-Logo.svg/320px-Microchip-Logo.svg.png',
  'Analog Devices': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Analog_Devices_Logo.svg/320px-Analog_Devices_Logo.svg.png',
  'Maxim': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Maxim_Integrated_logo.svg/320px-Maxim_Integrated_logo.svg.png',
  'Samsung': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Samsung_Logo.svg/320px-Samsung_Logo.svg.png',
  'SK Hynix': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/SK_hynix_CI.svg/320px-SK_hynix_CI.svg.png',
  'Micron': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Micron_Technology_logo.svg/320px-Micron_Technology_logo.svg.png',
  'Western Digital': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Western_Digital_logo.svg/320px-Western_Digital_logo.svg.png',
  'Seagate': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Seagate_Technology_Logo.svg/320px-Seagate_Technology_Logo.svg.png',
};

// Known vendor URLs
const VENDOR_URLS: Record<string, string> = {
  'ARM': 'https://www.arm.com/',
  'Intel': 'https://www.intel.com/',
  'AMD': 'https://www.amd.com/',
  'NVIDIA': 'https://www.nvidia.com/',
  'Xilinx': 'https://www.xilinx.com/',
  'Altera': 'https://www.intel.com/content/www/us/en/products/programmable.html',
  'Qualcomm': 'https://www.qualcomm.com/',
  'Broadcom': 'https://www.broadcom.com/',
  'Marvell': 'https://www.marvell.com/',
  'Texas Instruments': 'https://www.ti.com/',
  'TI': 'https://www.ti.com/',
  'NXP': 'https://www.nxp.com/',
  'STMicroelectronics': 'https://www.st.com/',
  'ST': 'https://www.st.com/',
  'Infineon': 'https://www.infineon.com/',
  'Renesas': 'https://www.renesas.com/',
  'Microchip': 'https://www.microchip.com/',
  'Analog Devices': 'https://www.analog.com/',
  'Maxim': 'https://www.maximintegrated.com/',
  'Samsung': 'https://www.samsung.com/semiconductor/',
  'SK Hynix': 'https://www.skhynix.com/',
  'Micron': 'https://www.micron.com/',
  'Western Digital': 'https://www.westerndigital.com/',
  'Seagate': 'https://www.seagate.com/',
};

export class BOMGenerator {
  /**
   * Generate BOM report from architecture
   */
  async generateBOM(projectId: string, projectName: string, components: any[]): Promise<BOMReport> {
    console.log(`📋 Generating BOM for project: ${projectName} (${components.length} components)`);

    // Step 1: Use AI to intelligently categorize components
    const categories = await this.categorizeComponents(components);

    // Step 2: For each component, suggest vendors
    const categoriesWithVendors: BOMCategory[] = [];

    for (const category of categories) {
      const componentsWithVendors: BOMComponent[] = [];

      for (const component of category.components) {
        const vendors = await this.suggestVendors(component);
        componentsWithVendors.push({
          ...component,
          suggestedVendors: vendors,
        });
      }

      categoriesWithVendors.push({
        ...category,
        components: componentsWithVendors,
      });
    }

    const report: BOMReport = {
      projectId,
      projectName,
      generatedAt: new Date(),
      categories: categoriesWithVendors,
      totalComponents: components.length,
    };

    console.log(`✅ BOM generated: ${categoriesWithVendors.length} categories, ${components.length} components`);

    return report;
  }

  /**
   * Use AI to intelligently categorize components
   */
  private async categorizeComponents(components: any[]): Promise<BOMCategory[]> {
    const prompt = `You are an expert SoC architect. Categorize the following components into logical categories.

Components to categorize:
${components.map((c, i) => `${i + 1}. ${c.name || c.id} - Type: ${c.type || 'Unknown'}`).join('\n')}

Requirements:
1. Create intelligent categories based on component functionality (e.g., "Processors", "Memory Controllers", "High-Speed I/O", "Peripherals", etc.)
2. Each component should belong to exactly one category
3. Category names should be professional and industry-standard
4. Provide a brief description for each category
5. Return ONLY valid JSON, no markdown formatting

Return format:
{
  "categories": [
    {
      "categoryName": "Category Name",
      "categoryDescription": "Brief description",
      "componentIndices": [0, 1, 2]
    }
  ]
}`;

    try {
      const response = await this.invokeAI(prompt);
      const result = JSON.parse(response);

      // Map component indices to actual components
      const categories: BOMCategory[] = result.categories.map((cat: any) => ({
        categoryName: cat.categoryName,
        categoryDescription: cat.categoryDescription,
        components: cat.componentIndices.map((idx: number) => {
          const component = components[idx];
          return {
            componentId: component.id,
            componentName: component.name || component.id,
            componentType: component.type || 'Unknown',
            category: cat.categoryName,
            description: component.description,
            suggestedVendors: [],
          };
        }),
      }));

      return categories;
    } catch (error) {
      console.error('AI categorization failed, using fallback:', error);
      return this.fallbackCategorization(components);
    }
  }

  /**
   * Suggest vendors for a component using AI
   */
  private async suggestVendors(component: BOMComponent): Promise<ComponentVendor[]> {
    const prompt = `You are a hardware procurement expert. Suggest 2-3 real vendors and part numbers for this component:

Component: ${component.componentName}
Type: ${component.componentType}
Category: ${component.category}
Description: ${component.description || 'N/A'}

Requirements:
1. Suggest REAL, existing vendors (e.g., Intel, ARM, AMD, TI, NXP, etc.)
2. Provide realistic part numbers (can be product families like "Cortex-M7", "i7-13700K", etc.)
3. Include brief description of why this vendor/part is suitable
4. Return ONLY valid JSON, no markdown formatting

Return format:
{
  "vendors": [
    {
      "vendor": "Vendor Name",
      "partNumber": "Part Number or Family",
      "description": "Why suitable"
    }
  ]
}`;

    try {
      const response = await this.invokeAI(prompt);
      const result = JSON.parse(response);

      return result.vendors.map((v: any) => ({
        vendor: v.vendor,
        partNumber: v.partNumber,
        logoUrl: this.getVendorLogo(v.vendor),
        productUrl: this.getVendorUrl(v.vendor, v.partNumber),
        description: v.description,
      }));
    } catch (error) {
      console.error(`Vendor suggestion failed for ${component.componentName}:`, error);
      return this.fallbackVendors(component);
    }
  }

  /**
   * Get vendor logo URL
   */
  private getVendorLogo(vendorName: string): string {
    // Try exact match first
    if (VENDOR_LOGOS[vendorName]) {
      return VENDOR_LOGOS[vendorName];
    }

    // Try partial match
    const vendorKey = Object.keys(VENDOR_LOGOS).find(key =>
      vendorName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(vendorName.toLowerCase())
    );

    if (vendorKey) {
      return VENDOR_LOGOS[vendorKey];
    }

    // Default placeholder
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(vendorName)}&background=0D8ABC&color=fff&size=128`;
  }

  /**
   * Get vendor or product URL
   */
  private getVendorUrl(vendorName: string, partNumber: string): string {
    // Try exact match first
    if (VENDOR_URLS[vendorName]) {
      return VENDOR_URLS[vendorName];
    }

    // Try partial match
    const vendorKey = Object.keys(VENDOR_URLS).find(key =>
      vendorName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(vendorName.toLowerCase())
    );

    if (vendorKey) {
      return VENDOR_URLS[vendorKey];
    }

    // Google search as fallback
    const query = encodeURIComponent(`${vendorName} ${partNumber} datasheet`);
    return `https://www.google.com/search?q=${query}`;
  }

  /**
   * Invoke AI model
   */
  private async invokeAI(prompt: string): Promise<string> {
    // Use configured model from environment or default to Nova Pro
    const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
    const isNova = modelId.includes('amazon.nova');
    const isClaude = modelId.includes('anthropic.claude');

    let payload: any;
    if (isNova) {
      payload = {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          max_new_tokens: 4096,
          temperature: 0.7,
          top_p: 0.9
        }
      };
    } else if (isClaude) {
      payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      };
    } else {
      payload = {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 4096,
        temperature: 0.7
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse response based on model type
    if (isNova) {
      return responseBody.output.message.content[0].text;
    } else if (isClaude) {
      return responseBody.content[0].text;
    } else {
      return responseBody.content?.[0]?.text || responseBody.text || '';
    }
  }

  /**
   * Fallback categorization (rule-based)
   */
  private fallbackCategorization(components: any[]): BOMCategory[] {
    const categories = new Map<string, BOMComponent[]>();

    for (const component of components) {
      const category = this.inferCategory(component);

      if (!categories.has(category)) {
        categories.set(category, []);
      }

      categories.get(category)!.push({
        componentId: component.id,
        componentName: component.name || component.id,
        componentType: component.type || 'Unknown',
        category,
        description: component.description,
        suggestedVendors: [],
      });
    }

    return Array.from(categories.entries()).map(([name, comps]) => ({
      categoryName: name,
      categoryDescription: this.getCategoryDescription(name),
      components: comps,
    }));
  }

  /**
   * Infer category from component name/type
   */
  private inferCategory(component: any): string {
    const name = (component.name || component.id || '').toLowerCase();
    const type = (component.type || '').toLowerCase();
    const category = (component.category || '').toLowerCase();

    // Processors & Compute
    if (name.includes('cpu') || name.includes('processor') || name.includes('core') || 
        type.includes('cpu') || category.includes('cpu')) {
      return 'Processors';
    }

    // Memory
    if (name.includes('memory') || name.includes('dram') || name.includes('sram') || 
        name.includes('ddr') || name.includes('hbm') || name.includes('cache') ||
        type.includes('memory') || category.includes('memory')) {
      return 'Memory Controllers';
    }

    // Accelerators
    if (name.includes('accelerator') || name.includes('npu') || name.includes('tpu') ||
        name.includes('dsp') || name.includes('ai') || name.includes('ml') ||
        type.includes('accelerator') || category.includes('accelerator')) {
      return 'Accelerators';
    }

    // Graphics
    if (name.includes('gpu') || name.includes('graphics') || name.includes('display') ||
        name.includes('video') || type.includes('gpu') || category.includes('gpu')) {
      return 'Graphics & Display';
    }

    // High-Speed I/O
    if (name.includes('pcie') || name.includes('usb') || name.includes('ethernet') || 
        name.includes('sata') || name.includes('nvme') || name.includes('thunderbolt') ||
        type.includes('io') || category.includes('io')) {
      return 'High-Speed I/O';
    }

    // Peripherals
    if (name.includes('uart') || name.includes('i2c') || name.includes('spi') || 
        name.includes('gpio') || name.includes('timer') || name.includes('pwm') ||
        type.includes('peripheral') || category.includes('peripheral')) {
      return 'Peripherals';
    }

    // Interconnect
    if (name.includes('noc') || name.includes('interconnect') || name.includes('bus') || 
        name.includes('crossbar') || name.includes('switch') || name.includes('router') ||
        name.includes('arbiter') || type.includes('interconnect') || 
        category.includes('interconnect')) {
      return 'Interconnect';
    }

    // Security & Crypto
    if (name.includes('crypto') || name.includes('security') || name.includes('encryption') ||
        name.includes('tpm') || name.includes('secure') || type.includes('security')) {
      return 'Security & Crypto';
    }

    // Power Management
    if (name.includes('power') || name.includes('pmu') || name.includes('voltage') ||
        name.includes('clock') || name.includes('pll') || type.includes('power')) {
      return 'Power & Clock';
    }

    // Storage Controllers
    if (name.includes('storage') || name.includes('flash') || name.includes('emmc') ||
        name.includes('sd') || type.includes('storage')) {
      return 'Storage Controllers';
    }

    // Network
    if (name.includes('network') || name.includes('nic') || name.includes('wifi') ||
        name.includes('bluetooth') || name.includes('5g') || type.includes('network')) {
      return 'Network Controllers';
    }

    // Audio
    if (name.includes('audio') || name.includes('sound') || name.includes('codec') ||
        type.includes('audio')) {
      return 'Audio Controllers';
    }

    // Custom/User-defined
    if (name.includes('custom') || type.includes('custom') || category.includes('custom')) {
      return 'Custom IP Blocks';
    }

    // Default fallback - use a more descriptive name
    return 'System Components';
  }

  /**
   * Get category description
   */
  private getCategoryDescription(categoryName: string): string {
    const descriptions: Record<string, string> = {
      'Processors': 'CPU cores and processing units',
      'Memory Controllers': 'Memory interfaces and controllers (DDR, HBM, SRAM)',
      'Accelerators': 'Hardware accelerators (AI, ML, DSP, NPU)',
      'Graphics & Display': 'Graphics processing and display controllers',
      'High-Speed I/O': 'High-bandwidth communication interfaces (PCIe, USB, Ethernet)',
      'Peripherals': 'Low-speed peripheral interfaces (UART, I2C, SPI, GPIO)',
      'Interconnect': 'On-chip network and bus infrastructure (NoC, crossbar, switches)',
      'Security & Crypto': 'Security and cryptographic modules',
      'Power & Clock': 'Power management and clock generation',
      'Storage Controllers': 'Storage interfaces (Flash, eMMC, SD)',
      'Network Controllers': 'Network interfaces (WiFi, Bluetooth, Ethernet)',
      'Audio Controllers': 'Audio processing and codec interfaces',
      'Custom IP Blocks': 'User-defined custom IP components',
      'System Components': 'General system components and utilities',
    };

    return descriptions[categoryName] || 'System components';
  }

  /**
   * Fallback vendor suggestions
   */
  private fallbackVendors(component: BOMComponent): ComponentVendor[] {
    const category = component.category.toLowerCase();

    if (category.includes('processor') || category.includes('cpu')) {
      return [
        {
          vendor: 'ARM',
          partNumber: 'Cortex-A Series',
          logoUrl: this.getVendorLogo('ARM'),
          productUrl: 'https://www.arm.com/products/silicon-ip-cpu',
          description: 'Industry-standard ARM processor cores',
        },
        {
          vendor: 'Intel',
          partNumber: 'Atom Series',
          logoUrl: this.getVendorLogo('Intel'),
          productUrl: 'https://www.intel.com/content/www/us/en/products/processors/atom.html',
          description: 'Low-power x86 processors',
        },
      ];
    }

    if (category.includes('memory')) {
      return [
        {
          vendor: 'Samsung',
          partNumber: 'DDR5 SDRAM',
          logoUrl: this.getVendorLogo('Samsung'),
          productUrl: 'https://semiconductor.samsung.com/dram/',
          description: 'High-performance memory solutions',
        },
        {
          vendor: 'Micron',
          partNumber: 'DDR Series',
          logoUrl: this.getVendorLogo('Micron'),
          productUrl: 'https://www.micron.com/products/dram',
          description: 'Industry-leading DRAM products',
        },
      ];
    }

    // Generic fallback
    return [
      {
        vendor: 'Generic Vendor',
        partNumber: 'Contact supplier',
        logoUrl: this.getVendorLogo('Generic'),
        productUrl: '#',
        description: 'Please contact suppliers for specific parts',
      },
    ];
  }
}
