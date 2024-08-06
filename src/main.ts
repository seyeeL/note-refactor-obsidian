// 从 Obsidian 库中导入所需的类和对象
import { MarkdownView, Plugin, Vault, DataAdapter, SuggestModal, getLinkpath, Editor } from 'obsidian'
// 从其他文件中导入所需的类和对象
import MomentDateRegex from './moment-date-regex'
import { NoteRefactorSettingsTab } from './settings-tab'
import { NoteRefactorSettings } from './settings'
import NRFile from './file'
import ObsidianFile from './obsidian-file'
import NRDoc, { ReplaceMode } from './doc'
import NoteRefactorModal from './note-modal'
import ModalNoteCreation from './modal-note-creation'

// 定义一个名为 NoteRefactor 的插件类，继承自 Obsidian 的 Plugin 类
export default class NoteRefactor extends Plugin {
  // 定义类的属性
  settings: NoteRefactorSettings
  momentDateRegex: MomentDateRegex
  obsFile: ObsidianFile
  file: NRFile
  NRDoc: NRDoc
  vault: Vault
  vaultAdapter: DataAdapter

  // 初始化方法，未做任何操作
  onInit() {}

  // 插件加载时调用的方法，使用 async 标记为异步函数
  async onload() {
    // 在控制台输出加载信息
    console.log('Loading Note Refactor plugin')
    // 初始化设置，加载数据并合并到默认设置中
    this.settings = Object.assign(new NoteRefactorSettings(), await this.loadData())
    // 实例化其他所需的类
    this.momentDateRegex = new MomentDateRegex()
    this.obsFile = new ObsidianFile(this.settings, this.app)
    this.file = new NRFile(this.settings)
    this.NRDoc = new NRDoc(this.settings, this.app.vault, this.app.fileManager)
    // 添加各种命令（command），这些命令可以在 Obsidian 中使用
    this.addCommand({
      id: 'app:extract-selection-first-line',
      name: 'Extract selection to new note - first line as file name',
      callback: () => this.editModeGuard(async () => await this.extractSelectionFirstLine('replace-selection')),
      hotkeys: [
        {
          modifiers: ['Mod', 'Shift'],
          key: 'n'
        }
      ]
    })

    this.addCommand({
      id: 'app:extract-selection-content-only',
      name: 'Extract selection to new note - content only',
      callback: () => this.editModeGuard(() => this.extractSelectionContentOnly('replace-selection')),
      hotkeys: [
        {
          modifiers: ['Mod', 'Shift'],
          key: 'c'
        }
      ]
    })

    this.addCommand({
      id: 'app:extract-selection-autogenerate-name',
      name: 'Extract selection to new note - only prefix as file name',
      callback: () => this.editModeGuard(() => this.extractSelectionAutogenerate('replace-selection'))
    })

    this.addCommand({
      id: 'app:split-note-first-line',
      name: 'Split note here - first line as file name',
      callback: () => this.editModeGuard(() => this.extractSelectionFirstLine('split'))
    })

    this.addCommand({
      id: 'app:split-note-content-only',
      name: 'Split note here - content only',
      callback: () => this.editModeGuard(() => this.extractSelectionContentOnly('split'))
    })

    this.addCommand({
      id: 'app:split-note-by-heading-h1',
      name: 'Split note by headings - H1',
      callback: () => this.editModeGuard(() => this.splitOnHeading(1))
    })

    this.addCommand({
      id: 'app:split-note-by-heading-h2',
      name: 'Split note by headings - H2',
      callback: () => this.editModeGuard(() => this.splitOnHeading(2))
    })

    this.addCommand({
      id: 'app:split-note-by-heading-h3',
      name: 'Split note by headings - H3',
      callback: () => this.editModeGuard(() => this.splitOnHeading(3))
    })

    // 添加设置面板
    this.addSettingTab(new NoteRefactorSettingsTab(this.app, this))
  }

  // 插件卸载时调用的方法
  onunload() {
    // 在控制台输出卸载信息
    console.log('Unloading Note Refactor plugin')
  }

  // 检查是否处于编辑模式的方法，如果是则执行命令
  editModeGuard(command: () => any): void {
    // 获取当前活动的 Markdown 视图
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView
    // 如果不存在或不处于源代码模式，弹出通知
    if (!mdView || mdView.getMode() !== 'source') {
      new Notification('Please use Note Refactor plugin in edit mode')
      return
    } else {
      // 否则执行传入的命令
      command()
    }
  }

  // 根据标题级别分割笔记的方法
  async splitOnHeading(headingLevel: number) {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView // 获取当前活动的 Markdown 视图
    const doc = mdView.editor // 获取文档编辑器
    const headingNotes = this.NRDoc.contentSplitByHeading(doc, headingLevel) // 根据标题级别分割内容
    const dedupedFileNames = this.file.ensureUniqueFileNames(headingNotes) // 保证文件名唯一
    headingNotes.forEach(
      (hn, i) => this.createNoteWithFirstLineAsFileName(dedupedFileNames[i], hn, mdView, doc, 'replace-headings', true) // 创建新笔记
    )
  }

  // 提取选中内容并以首行作为文件名的方法
  async extractSelectionFirstLine(mode: ReplaceMode): Promise<void> {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView // 获取当前活动的 Markdown 视图
    const doc = mdView.editor // 获取文档编辑器
    if (!mdView) {
      return
    }

    // 根据模式获取选中的内容
    const selectedContent = mode === 'split' ? this.NRDoc.noteRemainder(doc) : this.NRDoc.selectedContent(doc)
    if (selectedContent.length <= 0) {
      return
    }

    // 创建新笔记，以首行作为文件名
    await this.createNoteWithFirstLineAsFileName(selectedContent[0], selectedContent, mdView, doc, mode, false)
  }

  // 生成自动化文件名并提取选中内容的方法
  async extractSelectionAutogenerate(mode: ReplaceMode): Promise<void> {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView // 获取当前活动的 Markdown 视图
    const doc = mdView.editor // 获取文档编辑器
    if (!mdView) {
      return
    }

    // 根据模式获取选中的内容
    const selectedContent = mode === 'split' ? this.NRDoc.noteRemainder(doc) : this.NRDoc.selectedContent(doc)
    if (selectedContent.length <= 0) {
      return
    }

    // 创建新笔记，使用自动生成的文件名
    await this.createAutogeneratedNote(selectedContent, mdView, doc, mode, true) // 不在新窗格中打开新笔记。TODO: 也许一个设置会很有用？
  }

  // 私有方法，创建自动生成文件名的新笔记
  private async createAutogeneratedNote(
    selectedContent: string[], // 选中的内容
    mdView: MarkdownView, // 当前 Markdown 视图
    doc: Editor, // 文档编辑器
    mode: ReplaceMode, // 替换模式
    isMultiple: boolean // 是否多个笔记
  ) {
    const [header, ...contentArr] = selectedContent // 分割选中的内容，将首行作为标题

    const fileName = this.file.fileNamePrefix() // Only prefix is used for the note file name
    const originalNote = this.NRDoc.noteContent(header, contentArr) // 获取原始笔记内容
    let note = originalNote
    const filePath = await this.obsFile.createOrAppendFile(fileName, '') // 创建或追加文件

    if (this.settings.refactoredNoteTemplate !== undefined && this.settings.refactoredNoteTemplate !== '') {
      const link = await this.app.fileManager.generateMarkdownLink(mdView.file, '', '', '') // 生成 Markdown 链接
      const newNoteLink = await this.NRDoc.markdownLink(filePath) // 获取新的笔记链接
      note = this.NRDoc.templatedContent(
        note,
        this.settings.refactoredNoteTemplate,
        mdView.file.basename,
        link,
        fileName,
        newNoteLink,
        '',
        note
      ) // 使用模板生成内容
    }

    await this.obsFile.createOrAppendFile(fileName, note) // 创建或追加文件内容
    await this.NRDoc.replaceContent(fileName, filePath, doc, mdView.file, note, originalNote, mode) // 替换内容
    if (!isMultiple) {
      await this.app.workspace.openLinkText(fileName, getLinkpath(filePath), true) // 打开新的笔记
    }
  }

  // 私有方法，以首行作为文件名创建新笔记
  private async createNoteWithFirstLineAsFileName(
    dedupedHeader: string, // 已去重的标题
    selectedContent: string[], // 选中的内容
    mdView: MarkdownView, // 当前 Markdown 视图
    doc: Editor, // 文档编辑器
    mode: ReplaceMode, // 替换模式
    isMultiple: boolean // 是否多个笔记
  ) {
    const [originalHeader, ...contentArr] = selectedContent // 分割选中的内容，将首行作为标题

    const fileName = this.file.sanitisedFileName(dedupedHeader)
    const originalNote = this.NRDoc.noteContent(originalHeader, contentArr) // 获取原始笔记内容
    let note = originalNote
    const filePath = await this.obsFile.createOrAppendFile(fileName, '') // 创建或追加文件

    if (this.settings.refactoredNoteTemplate !== undefined && this.settings.refactoredNoteTemplate !== '') {
      const link = await this.app.fileManager.generateMarkdownLink(mdView.file, '', '', '') // 生成 Markdown 链接
      const newNoteLink = await this.NRDoc.markdownLink(filePath) // 获取新的笔记链接
      note = this.NRDoc.templatedContent(
        note,
        this.settings.refactoredNoteTemplate,
        mdView.file.basename,
        link,
        fileName,
        newNoteLink,
        '',
        note
      ) // 使用模板生成内容
    }
    await this.obsFile.createOrAppendFile(fileName, note) // 创建或追加文件内容
    await this.NRDoc.replaceContent(fileName, filePath, doc, mdView.file, note, originalNote, mode) // 替换内容
    if (!isMultiple && this.settings.openNewNote) {
      await this.app.workspace.openLinkText(fileName, getLinkpath(filePath), true) // 打开新的笔记
    }
  }

  // 提取选中内容仅作为内容的方法
  extractSelectionContentOnly(mode: ReplaceMode): void {
    const mdView = this.app.workspace.activeLeaf.view as MarkdownView // 获取当前活动的 Markdown 视图
    if (!mdView) {
      return
    }
    const doc = mdView.editor // 获取文档编辑器

    const contentArr = mode === 'split' ? this.NRDoc.noteRemainder(doc) : this.NRDoc.selectedContent(doc) // 获取内容数组
    if (contentArr.length <= 0) {
      return
    }
    this.loadModal(contentArr, doc, mode) // 加载模态框
  }

  // 加载模态框的方法
  loadModal(contentArr: string[], doc: Editor, mode: ReplaceMode): void {
    let note = this.NRDoc.noteContent(contentArr[0], contentArr.slice(1), true) // 获取笔记内容
    const modalCreation = new ModalNoteCreation(
      this.app,
      this.settings,
      this.NRDoc,
      this.file,
      this.obsFile,
      note,
      doc,
      mode
    ) // 创建模态框
    new NoteRefactorModal(this.app, modalCreation).open() // 打开模态框
  }
}
