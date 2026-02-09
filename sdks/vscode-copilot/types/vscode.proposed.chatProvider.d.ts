/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 4

declare module 'vscode' {

	/**
	* The provider version of {@linkcode LanguageModelChatRequestOptions}
	*/
	export interface ProvideLanguageModelChatResponseOptions {

		/**
		 * What extension initiated the request to the language model
		 */
		readonly requestInitiator: string;
	}

	/**
	 * All the information representing a single language model contributed by a {@linkcode LanguageModelChatProvider}.
	 */
	export interface LanguageModelChatInformation {

		requiresAuthorization?: true | { label: string };
		readonly multiplier?: string;
		readonly multiplierNumeric?: number;
		readonly isDefault?: boolean | { [K in ChatLocation]?: boolean };
		readonly isUserSelectable?: boolean;
		readonly category?: { label: string; order: number };
		readonly statusIcon?: ThemeIcon;
	}

	export interface LanguageModelChatCapabilities {
		readonly editTools?: string[];
	}

	export type LanguageModelResponsePart2 = LanguageModelResponsePart | LanguageModelDataPart | LanguageModelThinkingPart;

	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {
		provideLanguageModelChatInformation(options: PrepareLanguageModelChatModelOptions, token: CancellationToken): ProviderResult<T[]>;
		provideLanguageModelChatResponse(model: T, messages: readonly LanguageModelChatRequestMessage[], options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Thenable<void>;
	}

	export interface PrepareLanguageModelChatModelOptions {
		readonly configuration?: {
			readonly [key: string]: any;
		};
	}
}
