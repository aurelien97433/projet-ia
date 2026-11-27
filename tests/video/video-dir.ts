import { homedir } from "node:os";
import path from "node:path";

// Dossier de la vidéo de secours, hors du dépôt : DEMO_VIDEO_DIR, sinon ~/Videos/NexaMind-demo.
export const VIDEO_DIR = process.env.DEMO_VIDEO_DIR ?? path.join(homedir(), "Videos", "NexaMind-demo");
