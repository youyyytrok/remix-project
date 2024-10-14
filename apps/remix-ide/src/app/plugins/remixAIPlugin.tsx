import * as packageJson from '../../../../../package.json'
import { ViewPlugin } from '@remixproject/engine-web'
import { Plugin } from '@remixproject/engine';
import { RemixAITab, ChatApi } from '@remix-ui/remix-ai'
import React, { useCallback } from 'react';
import { ICompletions, IModel, RemoteInferencer, IRemoteModel, IParams, GenerationParams, CodeExplainAgent } from '@remix/remix-ai-core';

type chatRequestBufferT<T> = {
  [key in keyof T]: T[key]
}

const profile = {
  name: 'remixAI',
  displayName: 'Remix AI',
  methods: ['code_generation', 'code_completion',
    "solidity_answer", "code_explaining",
    "code_insertion", "error_explaining",
    "initialize", 'chatPipe', 'ProcessChatRequestBuffer', 'isChatRequestPending'],
  events: [],
  icon: 'assets/img/remix-logo-blue.png',
  description: 'RemixAI provides AI services to Remix IDE.',
  kind: '',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/remixai.html',
  version: packageJson.version,
  maintainedBy: 'Remix'
}

export class RemixAIPlugin extends ViewPlugin {
  isOnDesktop:boolean = false
  aiIsActivated:boolean = false
  readonly remixDesktopPluginName = 'remixAID'
  remoteInferencer:RemoteInferencer = null
  isInferencing: boolean = false
  chatRequestBuffer: chatRequestBufferT<any> = null
  agent: CodeExplainAgent

  constructor(inDesktop:boolean) {
    super(profile)
    this.isOnDesktop = inDesktop
    this.agent = new CodeExplainAgent(this)
    // user machine dont use ressource for remote inferencing
  }

  onActivation(): void {
    if (this.isOnDesktop) {
      console.log('Activating RemixAIPlugin on desktop')
      this.on(this.remixDesktopPluginName, 'activated', () => {
        this.call("remixAI", 'initialize', null, null, null, false);
      })
    } else {
      console.log('Activating RemixAIPlugin on browser')
      this.initialize()
    }
    this.setRemixAIOnSidePannel(false)
  }

  setRemixAIOnSidePannel(resize:boolean=false){
    if (resize){
      this.call('sidePanel', 'pinView', profile)

    } else {
      this.call('sidePanel', 'pinView', profile)
    }
  }

  async initialize(model1?:IModel, model2?:IModel, remoteModel?:IRemoteModel, useRemote?:boolean){
    if (this.isOnDesktop) {
      // on desktop use remote inferencer -> false
      console.log('initialize on desktop')
      const res = await this.call(this.remixDesktopPluginName, 'initializeModelBackend', useRemote, model1, model2)
      if (res) {
        this.on(this.remixDesktopPluginName, 'onStreamResult', (value) => {
          this.call('terminal', 'log', { type: 'log', value: value })
        })

        this.on(this.remixDesktopPluginName, 'onInference', () => {
          this.isInferencing = true
        })

        this.on(this.remixDesktopPluginName, 'onInferenceDone', () => {
          this.isInferencing = false
        })
      }

    } else {
      this.remoteInferencer = new RemoteInferencer(remoteModel?.apiUrl, remoteModel?.completionUrl)
      this.remoteInferencer.event.on('onInference', () => {
        this.isInferencing = true
      })
      this.remoteInferencer.event.on('onInferenceDone', () => {
        this.isInferencing = false
      })
    }

    this.aiIsActivated = true
    return true
  }

  async code_generation(prompt: string): Promise<any> {
    if (this.isInferencing) {
      this.call('terminal', 'log', { type: 'aitypewriterwarning', value: "RemixAI is already busy!" })
      return
    }

    if (this.isOnDesktop) {
      return await this.call(this.remixDesktopPluginName, 'code_generation', prompt)
    } else {
      return await this.remoteInferencer.code_generation(prompt)
    }
  }

  async code_completion(prompt: string): Promise<any> {
    if (this.isOnDesktop) {
      return await this.call(this.remixDesktopPluginName, 'code_completion', prompt)
    } else {
      return await this.remoteInferencer.code_completion(prompt)
    }
  }

  async solidity_answer(prompt: string, params: IParams=GenerationParams): Promise<any> {
    if (this.isInferencing) {
      this.call('terminal', 'log', { type: 'aitypewriterwarning', value: "RemixAI is already busy!" })
      return
    }

    const newPrompt = await this.agent.chatCommand(prompt)
    let result
    if (this.isOnDesktop) {
      result = await this.call(this.remixDesktopPluginName, 'solidity_answer', newPrompt)
    } else {
      result = await this.remoteInferencer.solidity_answer(newPrompt)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async code_explaining(prompt: string, context: string, params: IParams=GenerationParams): Promise<any> {
    if (this.isInferencing) {
      this.call('terminal', 'log', { type: 'aitypewriterwarning', value: "RemixAI is already busy!" })
      return
    }

    let result
    if (this.isOnDesktop) {
      result = await this.call(this.remixDesktopPluginName, 'code_explaining', prompt, context, params)

    } else {
      result = await this.remoteInferencer.code_explaining(prompt, context, params)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async error_explaining(prompt: string, context: string="", params: IParams=GenerationParams): Promise<any> {
    if (this.isInferencing) {
      this.call('terminal', 'log', { type: 'aitypewriterwarning', value: "RemixAI is already busy!" })
      return
    }

    let result
    if (this.isOnDesktop) {
      result = await this.call(this.remixDesktopPluginName, 'error_explaining', prompt)
    } else {
      result = await this.remoteInferencer.error_explaining(prompt, params)
    }
    if (result && params.terminal_output) this.call('terminal', 'log', { type: 'aitypewriterwarning', value: result })
    return result
  }

  async code_insertion(msg_pfx: string, msg_sfx: string): Promise<any> {
    if (this.isOnDesktop) {
      return await this.call(this.remixDesktopPluginName, 'code_insertion', msg_pfx, msg_sfx)
    } else {
      return await this.remoteInferencer.code_insertion(msg_pfx, msg_sfx)
    }
  }

  chatPipe(fn, prompt: string, context?: string, pipeMessage?: string){
    if (this.chatRequestBuffer == null){
      this.chatRequestBuffer = {
        fn_name: fn,
        prompt: prompt,
        context: context
      }
      if (pipeMessage) ChatApi.composer.send(pipeMessage)
      else {
        if (fn === "code_explaining") ChatApi.composer.send("Explain the current code")
        else if (fn === "error_explaining") ChatApi.composer.send("Explain the error")
        else if (fn === "solidity_answer") ChatApi.composer.send("Answer the following question")
        else console.log("chatRequestBuffer is not empty. First process the last request.")
      }
    }
    else {
      console.log("chatRequestBuffer is not empty. First process the last request.")
    }
  }

  async ProcessChatRequestBuffer(params:IParams=GenerationParams){
    if (this.chatRequestBuffer != null){
      const result = this[this.chatRequestBuffer.fn_name](this.chatRequestBuffer.prompt, this.chatRequestBuffer.context, params)
      this.chatRequestBuffer = null
      return result
    }
    else {
      console.log("chatRequestBuffer is empty.")
      return ""
    }
  }
  isChatRequestPending(){
    return this.chatRequestBuffer != null
  }

  render() {
    return (
      <RemixAITab plugin={this}></RemixAITab>
    )
  }
}
