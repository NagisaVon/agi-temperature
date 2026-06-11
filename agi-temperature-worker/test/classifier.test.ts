import { describe, expect, it } from 'vitest';
import { CLASSIFIER_VERSION, isAI } from '../src/classifier';

describe('classifier c1', () => {
	it('exports a version string', () => {
		expect(CLASSIFIER_VERSION).toBe('c1');
	});

	describe('core terms', () => {
		it.each([
			'What is AI?',
			'Show HN: My AI-powered todo app',
			'(AI) considered harmful',
			'AGI timelines are a distraction',
			'LLMs use tactical nukes in 95% of simulations',
			'Why your LLM is lying to you',
			'GPT-5 architecture deep dive',
			'Machine learning for beginners',
			'Deep learning is hitting a wall',
			'Neural networks from scratch',
			'I built a chatbot for my dog',
			'Generative art before the generative era',
			'Diffusion models explained',
			'Prompt engineering is dead',
			'Pool money behind a prompt',
			'RLHF considered harmful',
			'Fine-tuning Llama on a laptop',
			'Superintelligence by 2030?',
			'Retrieval-augmented generation (RAG) in production',
			'Multimodal models are eating the world',
			'A new foundation model for biology',
		])('matches %j', (title) => {
			expect(isAI(title)).toBe(true);
		});
	});

	describe('companies and models', () => {
		it.each([
			'OpenAI releases GPT-5',
			'Anthropic apologizes for invisible guardrails',
			'Claude Fable 5: mid-tier results on coding tasks',
			'ChatGPT outage postmortem',
			'Gemini 3 benchmarks',
			'DeepMind solves protein folding again',
			'Mistral raises another round',
			'Llama 4 running on a Raspberry Pi',
			'Open Reproduction of DeepSeek-R1',
			'Midjourney v8 first impressions',
			'Stable Diffusion in the browser',
			'GitHub Copilot wrote my thesis',
			'Grok says the darndest things',
			'Qwen 3 technical report',
			'Hugging Face acquires a robotics startup',
			'Perplexity bids for Chrome',
			'Sora generates a feature film',
			'Waymo Premier',
		])('matches %j', (title) => {
			expect(isAI(title)).toBe(true);
		});
	});

	describe('adjacent tech (D2 maximal scope)', () => {
		it.each([
			'GPUs are cheap again',
			'NVIDIA earnings beat expectations',
			'CUDA alternatives in 2026',
			'TPU v6 benchmarks',
			'New datacenter in Ohio draws a gigawatt',
			'The data center boom is reshaping rural America',
			'H100 prices crater',
			'B200 supply chain woes',
			'Scaling laws revisited',
			'AI safety researchers quit en masse',
			'Inference at the edge',
		])('matches %j', (title) => {
			expect(isAI(title)).toBe(true);
		});
	});

	describe('word boundaries — substrings must not match', () => {
		it.each([
			'Air quality in Paris reaches record low', // air ≠ AI
			'Repairing a 1970s synthesizer', // repAIr
			'Sailing across the Atlantic alone', // sAIling
			'The maid cleaned the lobby', // mAId
			'Said and done: a memoir', // sAId
			'Wait, that is not how raids work', // rAIds
			'Tragus piercing aftercare', // ...agus? (no term inside)
			'Aslan returns in new Narnia adaptation', // ASlan ≠ ASI
			'The basilisk myth in medieval Europe', // basILisk? no LLM inside
			'Eight years of vanilla JavaScript', // no match
		])('does not match %j', (title) => {
			expect(isAI(title)).toBe(false);
		});
	});

	describe('plain tech/world news stays cold', () => {
		it.each([
			'Show HN: Homebrew 6.0.0',
			'Postgres 18 released',
			'Rust 2.0 announced',
			'Emacs appearances in pop culture',
			'FPS.cob: A first person shooter in COBOL',
			'Solar generates more energy in US than coal for first time',
			'Conway’s Game of Life, in real life',
			'The unreasonable effectiveness of simple HTML (2021)',
			'Ask HN: Best mechanical keyboard in 2026?',
			'Why I left my job at a big company',
		])('does not match %j', (title) => {
			expect(isAI(title)).toBe(false);
		});
	});

	describe('accepted false positives (documented in PRD)', () => {
		it('counts Ai Weiwei (case-insensitive word match)', () => {
			expect(isAI('Ai Weiwei retrospective opens in Berlin')).toBe(true);
		});
		it('counts the Gemini protocol', () => {
			expect(isAI('Gemini protocol vs HTTP')).toBe(true);
		});
	});
});
