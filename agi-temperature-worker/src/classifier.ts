/**
 * AI-relatedness classifier (PRD §4.2, decision D2: maximal scope).
 * Any change to TERMS bumps CLASSIFIER_VERSION; historical rows keep the
 * version that classified them, so the list can be re-run on stored titles.
 */

export const CLASSIFIER_VERSION = 'c1';

// One flat list at runtime; the tier comments are documentation only.
const TERMS: readonly string[] = [
	// Core
	'ai',
	'agi',
	'asi',
	'llm',
	'llms',
	'gpt',
	'machine learning',
	'deep learning',
	'neural network',
	'neural networks',
	'neural net',
	'neural nets',
	'chatbot',
	'chatbots',
	'transformer model',
	'transformer models',
	'generative',
	'diffusion model',
	'diffusion models',
	'prompt',
	'prompts',
	'prompting',
	'prompt engineering',
	'superintelligence',
	'alignment',
	'rlhf',
	'fine-tune',
	'fine-tuned',
	'fine-tuning',
	'finetune',
	'finetuned',
	'finetuning',
	'inference',
	'rag',
	'multimodal',
	'language model',
	'language models',
	'foundation model',
	'foundation models',
	'agentic',
	'text-to-image',
	'text-to-video',
	// Companies & models
	'openai',
	'anthropic',
	'claude',
	'chatgpt',
	'gemini',
	'deepmind',
	'mistral',
	'llama',
	'midjourney',
	'stable diffusion',
	'stability ai',
	'copilot',
	'cursor',
	'grok',
	'qwen',
	'deepseek',
	'hugging face',
	'huggingface',
	'perplexity',
	'sora',
	'waymo',
	'xai',
	// Adjacent tech (the AI-industrial complex)
	'gpu',
	'gpus',
	'nvidia',
	'cuda',
	'tpu',
	'tpus',
	'datacenter',
	'datacenters',
	'data center',
	'data centers',
	'data centre',
	'data centres',
	'h100',
	'h200',
	'a100',
	'b200',
	'gb200',
	'blackwell',
	'scaling laws',
	'compute cluster',
	'pytorch',
	'tensorflow',
];

function escapeRegExp(term: string): string {
	return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PATTERN = new RegExp(`\\b(?:${TERMS.map(escapeRegExp).join('|')})\\b`, 'i');

export function isAI(title: string): boolean {
	return PATTERN.test(title);
}
