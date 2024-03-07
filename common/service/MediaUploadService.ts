import { Injectable, Injector } from "async-injection";
import multer from "fastify-multer";
import S3Storage from "../utils/FastifyMulterS3.js";
import S3Service from "./S3Service.js";
import SnowflakeService from "./SnowflakeService.js";
import { randomFillSync } from "node:crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	GetObjectCommandOutput,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import sharp from "sharp";
import { encode } from "blurhash";
import { Upload, UploadStorageType } from "@prisma/client";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import mime from "mime-types";

type Multer = ReturnType<typeof multer>;

@Injectable()
class MediaUploadService {
	readonly #snowflake: SnowflakeService;
	readonly #s3: S3Service;
	readonly #bucket: string;
	readonly #maxFileSizeLimit: number;
	readonly #multers: Map<string, Multer>;

	constructor(
		snowflake: SnowflakeService,
		s3: S3Service,
		bucket: string,
		maxFileSizeLimit: number,
	) {
		this.#snowflake = snowflake;
		this.#s3 = s3;
		this.#bucket = bucket;
		this.#multers = new Map();
		this.#maxFileSizeLimit = maxFileSizeLimit;
	}

	/**
	 * Returns and caches a multer instance for the given path. Subsequent calls will return the same instance.
	 * @param name name of the directory to upload to
	 * @returns a Multer instance
	 */
	getMulter(name: string): Multer {
		if (this.#multers.has(name)) {
			return this.#multers.get(name)!;
		}

		const upload = this.createMulter(name);
		this.#multers.set(name, upload);

		return upload;
	}

	/**
	 * Returns a multer instance that doesn't get cached in internal map. Subsequent calls will return a new instance.
	 * @param name name of the directory to upload to
	 * @returns a Multer instance
	 */
	createMulter(name: string): Multer {
		return multer({
			limits: {
				fileSize: this.#maxFileSizeLimit,
			},
			storage: new S3Storage({
				s3: this.#s3,
				bucket: this.#bucket,
				destination: `${name}/`,
				filename: (req, file, cb) => {
					cb(null, this.#createFileId());
				},
			}),
		});
	}

	/**
	 * Returns an unique file id with extension based on the given file name.
	 */
	#createFileId(): string {
		const id = this.#snowflake.gen();
		const buffer = Buffer.alloc(32);
		buffer.writeBigUInt64LE(id);
		randomFillSync(buffer, 8, 24);

		const name = buffer.toString("base64url");
		return name;
	}

	async deleteFile(key: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.#bucket,
			Key: key,
		});
		await this.#s3.send(command);
	}

	async generatePutPresignedUrl(
		folder: string,
		protect: boolean,
	): Promise<{ key: string; presignedUrl: string }> {
		const name = this.#createFileId();
		const path = `${folder}/${name}`;
		const command = new PutObjectCommand({
			Bucket: this.#bucket,
			Key: path,
			ACL: protect ? "private" : "public-read",
		});
		const presignedUrl = await getSignedUrl(this.#s3, command, {
			expiresIn: 3600,
		});

		return {
			key: path,
			presignedUrl,
		};
	}

	async generateGetPresignedUrl(key: string): Promise<string> {
		const command = new GetObjectCommand({
			Bucket: this.#bucket,
			Key: key,
		});
		const presignedUrl = await getSignedUrl(this.#s3, command, {
			expiresIn: 3600,
		});

		return presignedUrl;
	}

	async generateBlurhash(
		key: string,
		storage: UploadStorageType,
	): Promise<string | undefined> {
		if (storage !== UploadStorageType.S3) return undefined;

		const image = await sharp(await this.getImageBuffer(key))
			.resize(16, 16, { fit: "cover" })
			.raw()
			.ensureAlpha();

		return encode(
			new Uint8ClampedArray(await image.toBuffer()),
			16,
			16,
			4,
			4,
		);
	}

	private async getImageBuffer(key: string): Promise<Buffer> {
		const command = new GetObjectCommand({
			Bucket: this.#bucket,
			Key: key,
		});
		const response = await this.#s3.send(command);
		return await this.asBuffer(response);
	}

	private asStream(response: GetObjectCommandOutput): Readable {
		return response.Body as Readable;
	}

	private async asBuffer(response: GetObjectCommandOutput) {
		const stream = this.asStream(response);
		const chunks: Buffer[] = [];
		return new Promise<Buffer>((resolve, reject) => {
			stream.on("data", (chunk) => chunks.push(chunk));
			stream.on("error", (err) => reject(err));
			stream.on("end", () => resolve(Buffer.concat(chunks)));
		});
	}

	async getMultiFilesStream(uploads: Upload[]) {
		const archive = archiver("zip", { zlib: { level: 5 } });
		for (const upload of uploads.filter(
			(u) => u.storage === UploadStorageType.S3,
		)) {
			const passthrough = new PassThrough();
			const command = new GetObjectCommand({
				Bucket: this.#bucket,
				Key: upload.url,
			});
			const response = await this.#s3.send(command);

			const extension = response.ContentType
				? mime.extension(response.ContentType)
				: "";
			const filename = upload.url.replace(/^.*[\\/]/, "");
			this.asStream(response).pipe(passthrough);
			archive.append(passthrough, {
				name: `${filename}${extension ? `.${extension}` : ""}`,
			});
		}
		return archive;
	}
}

export async function mediaUploadFactory(
	injector: Injector,
): Promise<MediaUploadService> {
	const s3 = await injector.resolve(S3Service);
	const snowflake = await injector.resolve(SnowflakeService);

	const bucket = process.env.S3_BUCKET;
	if (!bucket) throw new Error("S3_BUCKET is not set");

	const maxFileSizeLimit = process.env.MAX_FILE_SIZE_LIMIT;
	if (!maxFileSizeLimit) throw new Error("MAX_FILE_SIZE_LIMIT is not set");

	const mediaCDN = new MediaUploadService(
		snowflake,
		s3,
		bucket,
		parseInt(maxFileSizeLimit),
	);

	return mediaCDN;
}

export default MediaUploadService;
