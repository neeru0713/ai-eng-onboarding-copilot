import dotenv from "dotenv";
// @ts-ignore
import TurndownService from "turndown";

dotenv.config();

export interface ConfluencePage {
  id: string;
  title: string;
  url: string;
  content: string; // HTML converted to Markdown
}

/**
 * Crawls a Confluence Cloud space for all pages, retrieves body HTML,
 * and converts the content to markdown.
 * 
 * @param spaceKey The space key to crawl (e.g. "ENG").
 * @returns Array of parsed ConfluencePage objects.
 */
export async function crawlConfluenceSpace(spaceKey: string): Promise<ConfluencePage[]> {
  const domain = process.env.CONFLUENCE_DOMAIN;
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;

  if (!domain || !email || !token) {
    throw new Error(
      "Missing Confluence configuration. Make sure CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN are set in .env."
    );
  }

  // Ensure domain doesn't double-include http protocol
  const cleanDomain = domain.replace(/^https?:\/\//, "");
  const baseUrl = `https://${cleanDomain}`;
  
  // Use classic endpoint /wiki/rest/api/content with spaceKey and body.storage expansion
  const url = `${baseUrl}/wiki/rest/api/content?spaceKey=${spaceKey}&expand=body.storage&limit=100`;

  console.log(`Fetching pages for space: ${spaceKey} from Confluence...`);

  const authHeader = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Confluence API HTTP error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const results = data.results || [];
  console.log(`Successfully fetched ${results.length} pages from Confluence space ${spaceKey}.`);

  const turndownService = new TurndownService();

  const pages: ConfluencePage[] = results.map((page: any) => {
    // Get raw HTML from storage representation
    const html = page.body?.storage?.value || "";
    
    // Convert HTML to Markdown (automatically strips headers, navs, footers as we only parse page.body.storage)
    const markdown = turndownService.turndown(html);

    // Build the full web URL to the page
    const relativeUrl = page._links?.webui || "";
    const fullUrl = relativeUrl ? `${baseUrl}/wiki${relativeUrl}` : "";

    return {
      id: page.id,
      title: page.title,
      url: fullUrl || page.title,
      content: markdown,
    };
  });

  return pages;
}
