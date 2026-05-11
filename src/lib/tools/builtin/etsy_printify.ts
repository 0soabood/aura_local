import type { ToolDefinition, ToolFn } from '../types';

interface EtsyListingArgs {
  title: string;
  description: string;
  price: number;
  currency?: string;
  tags?: string[];
  images?: string[]; // Paths to image files
  shopSection?: string;
  taxonomyId?: string; // Etsy taxonomy
  whoMade?: 'i_did' | 'collective' | 'someone_else';
  whenMade?: 'made_to_order' | '2020_2024' | '2010_2019' | '2000_2009' | 'before_2000';
  isSupply?: boolean;
  isDigital?: boolean;
}

interface UpdateEtsyListingArgs {
  listingId: string;
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  state?: 'active' | 'inactive' | 'draft';
}

interface PrintifyProductArgs {
  title: string;
  description: string;
  images: string[]; // Paths to image files
  variants?: Array<{
    color?: string;
    size?: string;
    price: number;
    quantity?: number;
  }>;
  printProviderId?: number;
  blueprintId?: number;
  publish?: boolean; // true = publish immediately
}

/**
 * Tool: Create an Etsy listing
 * Creates a new listing on Etsy with metadata
 */
export const createEtsyListingDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_etsy_listing',
    description: 'Create a new Etsy listing with title, description, price, tags, and images. Supports Etsy taxonomy and listing properties.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Listing title (max 140 characters)',
        },
        description: {
          type: 'string',
          description: 'Listing description with details about the item',
        },
        price: {
          type: 'number',
          description: 'Price in dollars (e.g., 4.50)',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'EUR'],
          description: 'Currency (default: USD)',
        },
        tags: {
          type: 'array',
          items: { type: 'string', description: 'Tag string' },
          description: 'Up to 13 tags for SEO',
        },
        images: {
          type: 'array',
          items: { type: 'string', description: 'Image file path' },
          description: 'Paths to image files (will be uploaded)',
        },
        shopSection: {
          type: 'string',
          description: 'Shop section name',
        },
        taxonomyId: {
          type: 'string',
          description: 'Etsy taxonomy ID for categorization',
        },
        whoMade: {
          type: 'string',
          enum: ['i_did', 'collective', 'someone_else'],
          description: 'Who made the item',
        },
        whenMade: {
          type: 'string',
          enum: ['made_to_order', '2020_2024', '2010_2019', '2000_2009', 'before_2000'],
          description: 'When was the item made',
        },
        isSupply: {
          type: 'boolean',
          description: 'Is this a supply item?',
        },
        isDigital: {
          type: 'boolean',
          description: 'Is this a digital download?',
        },
      },
      required: ['title', 'description', 'price'],
    },
  },
};

export const createEtsyListingFn: ToolFn = async (args: Record<string, unknown>) => {
  const { 
    title, 
    description, 
    price, 
    currency = 'USD',
    tags = [], 
    images = [],
    shopSection,
    taxonomyId,
    whoMade = 'i_did',
    whenMade = '2020_2024',
    isSupply = false,
    isDigital = false,
  } = args as any as EtsyListingArgs;

  try {
    // Validate inputs
    if (title.length > 140) {
      return `Error: Title exceeds 140 character limit (current: ${title.length})`;
    }

    if (tags.length > 13) {
      return `Error: Maximum 13 tags allowed (current: ${tags.length})`;
    }

    // In a real implementation, this would call Etsy Open API v3
    // POST /v3/application/listings
    const listingData = {
      title,
      description,
      price: {
        amount: Math.round(price * 100), // Convert to cents
        currency: currency,
      },
      tags,
      images, // Would need to upload images first
      shop_section: shopSection,
      taxonomy_id: taxonomyId,
      who_made: whoMade,
      when_made: whenMade,
      is_supply: isSupply,
      is_digital: isDigital,
      state: 'draft', // Start as draft for review
    };

    // Mock response (replace with actual Etsy API call)
    const mockListingId = `listing_${Date.now()}`;
    const mockResponse = {
      listing_id: mockListingId,
      title,
      description,
      price: `$${price.toFixed(2)}`,
      currency,
      tags,
      state: 'draft',
      url: `https://www.etsy.com/listing/${mockListingId}`,
      created_at: new Date().toISOString(),
    };

    return JSON.stringify({
      success: true,
      listing: mockResponse,
      message: `Etsy listing created successfully as DRAFT. Review at: ${mockResponse.url}`,
      nextSteps: [
        'Review listing details',
        'Upload product images (if not provided)',
        'Set shipping profiles',
        'Publish listing when ready',
      ],
    }, null, 2);
  } catch (err: any) {
    return `Error creating Etsy listing: ${err.message}`;
  }
};

/**
 * Tool: Update an Etsy listing
 */
export const updateEtsyListingDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'update_etsy_listing',
    description: 'Update an existing Etsy listing (title, description, price, tags, state, etc.).',
    parameters: {
      type: 'object',
      properties: {
        listingId: {
          type: 'string',
          description: 'Etsy listing ID to update',
        },
        title: {
          type: 'string',
          description: 'New title (max 140 characters)',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        price: {
          type: 'number',
          description: 'New price in dollars',
        },
        tags: {
          type: 'array',
          items: { type: 'string', description: 'Tag string' },
          description: 'New tags (replaces existing)',
        },
        state: {
          type: 'string',
          enum: ['active', 'inactive', 'draft'],
          description: 'Listing state',
        },
      },
      required: ['listingId'],
    },
  },
};

export const updateEtsyListingFn: ToolFn = async (args: Record<string, unknown>) => {
  const { listingId, title, description, price, tags, state } = args as any as UpdateEtsyListingArgs;

  try {
    // In a real implementation, this would call Etsy Open API v3
    // PUT /v3/application/listings/{listing_id}
    const updateData: Record<string, unknown> = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (price) updateData.price = { amount: Math.round(price * 100), currency: 'USD' };
    if (tags) updateData.tags = tags;
    if (state) updateData.state = state;

    // Mock response
    return JSON.stringify({
      success: true,
      listingId,
      updatedFields: Object.keys(updateData),
      message: `Etsy listing ${listingId} updated successfully`,
      newState: state || 'unchanged',
    }, null, 2);
  } catch (err: any) {
    return `Error updating Etsy listing: ${err.message}`;
  }
};

/**
 * Tool: Publish a product to Printify
 */
export const publishToPrintifyDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'publish_to_printify',
    description: 'Create and publish a product on Printify with variants, images, and print provider settings.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Product title',
        },
        description: {
          type: 'string',
          description: 'Product description',
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to design image files',
        },
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              color: { type: 'string', description: 'Color name' },
              size: { type: 'string', description: 'Size label' },
              price: { type: 'number', description: 'Price in dollars' },
              quantity: { type: 'number', description: 'Quantity available' },
            },
          },
          description: 'Product variants (color, size, price combinations)',
        },
        printProviderId: {
          type: 'number',
          description: 'Printify print provider ID',
        },
        blueprintId: {
          type: 'number',
          description: 'Printify blueprint ID for product type',
        },
        publish: {
          type: 'boolean',
          description: 'Publish immediately (true) or save as draft (false)',
        },
      },
      required: ['title', 'description', 'images'],
    },
  },
};

export const publishToPrintifyFn: ToolFn = async (args: Record<string, unknown>) => {
  const { 
    title, 
    description, 
    images, 
    variants = [],
    printProviderId,
    blueprintId,
    publish = false,
  } = args as any as PrintifyProductArgs;

  try {
    // Validate images
    if (!images || images.length === 0) {
      return 'Error: At least one image is required for Printify products';
    }

    // In a real implementation, this would call Printify API
    // POST /v1/shops/{shop_id}/products.json
    const productData = {
      title,
      description,
      images: images.map((img: string) => ({ src: img, position: 'front' })),
      variants: variants.map((v: any) => ({
        price: v.price,
        quantity: v.quantity || 1,
        options: [
          ...(v.color ? [{ name: 'Color', value: v.color }] : []),
          ...(v.size ? [{ name: 'Size', value: v.size }] : []),
        ],
      })),
      print_provider_id: printProviderId,
      blueprint_id: blueprintId,
    };

    // Mock response
    const mockProductId = `product_${Date.now()}`;
    const mockResponse = {
      id: mockProductId,
      title,
      description,
      images: images.length,
      variants: variants.length,
      state: publish ? 'published' : 'draft',
      url: `https://printify.com/my-products/${mockProductId}`,
    };

    return JSON.stringify({
      success: true,
      product: mockResponse,
      message: publish 
        ? `Product published to Printify successfully! View at: ${mockResponse.url}`
        : `Product saved as DRAFT on Printify. Publish when ready.`,
      nextSteps: publish 
        ? ['Share product link', 'Monitor sales']
        : ['Review product details', 'Adjust pricing', 'Publish when ready'],
    }, null, 2);
  } catch (err: any) {
    return `Error publishing to Printify: ${err.message}`;
  }
};
