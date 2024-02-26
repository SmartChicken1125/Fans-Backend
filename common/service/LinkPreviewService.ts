import { Injectable, Injector } from "async-injection";
import { getLinkPreview } from "link-preview-js";
import dns from "node:dns";

@Injectable()
class LinkPreviewService {
	async getPreview(link: string) {
		const response = await getLinkPreview(link, {
			resolveDNSHost: async (url: string) => {
				return new Promise((resolve, reject) => {
					const hostname = new URL(url).hostname;
					dns.lookup(hostname, (err, address, family) => {
						if (err) {
							reject(err);
							return;
						}
						resolve(address); // if address resolves to localhost or '127.0.0.1' library will throw an error
					});
				});
			},
			followRedirects: "follow",
			handleRedirects: (baseURL: string, forwardedURL: string) => {
				const urlObj = new URL(baseURL);
				const forwardedURLObj = new URL(forwardedURL);
				if (
					forwardedURLObj.hostname === urlObj.hostname ||
					forwardedURLObj.hostname === "www." + urlObj.hostname ||
					"www." + forwardedURLObj.hostname === urlObj.hostname
				) {
					return true;
				} else {
					return false;
				}
			},
		});
		return response;
	}
}

export async function linkPreviewServiceFactory(
	injector: Injector,
): Promise<LinkPreviewService> {
	return new LinkPreviewService();
}

export default LinkPreviewService;
