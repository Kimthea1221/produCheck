---
tags:
- sentence-transformers
- sentence-similarity
- feature-extraction
- dense
- generated_from_trainer
- dataset_size:326137
- loss:MultipleNegativesRankingLoss
- loss:ContrastiveLoss
base_model: sentence-transformers/all-MiniLM-L6-v2
widget:
- source_sentence: bestph glysolid glycerin cream ph seller
  sentences:
  - lavojoy radiant rituals holiday set lavojoy let it glow daily shine body serum
  - glysolid glycerin cream
  - alloria santal pao rosa eau de parfum
- source_sentence: the luxury bathing company top to toe essentials bath soak check
    description shopusa
  sentences:
  - levon kojic glutathione calamansi 3in1 soap
  - zara hair midnight after everything hair perfume
  - the luxury bathing company top to toe essentials bath soak
- source_sentence: low price ferns bee hot item wild venom moisturiser
  sentences:
  - wild ferns bee venom night crème
  - wild ferns bee venom moisturiser
  - clarins instant smooth
- source_sentence: attitude natural care peau sensible skin care hand cream moisturize
    relieve dry skin argan oil with oatmeal version
  sentences:
  - attitude natural care peau sensible skin care hand cream moisturize relieve dry
    skin argan oil with oatmeal
  - attitude natural care oatmeal skin lotion cream essence eye cream bestph
  - hudson bath co cream
- source_sentence: affordable teal's epsom salt body scrub exfoliate renew with eucalyptus
    spearmint dr
  sentences:
  - dr teal's epsom salt body scrub exfoliate renew with eucalyptus spearmint
  - chanel coco mademoiselle fresh body moisture mist
  - dr teal's with skin lotion cream essence eye cream primehub korea stocks
pipeline_tag: sentence-similarity
library_name: sentence-transformers
metrics:
- cosine_accuracy
- cosine_accuracy_threshold
- cosine_f1
- cosine_f1_threshold
- cosine_precision
- cosine_recall
- cosine_ap
- cosine_mcc
model-index:
- name: SentenceTransformer based on sentence-transformers/all-MiniLM-L6-v2
  results:
  - task:
      type: binary-classification
      name: Binary Classification
    dataset:
      name: val verify
      type: val_verify
    metrics:
    - type: cosine_accuracy
      value: 0.9811924545250393
      name: Cosine Accuracy
    - type: cosine_accuracy_threshold
      value: 0.7967153191566467
      name: Cosine Accuracy Threshold
    - type: cosine_f1
      value: 0.9811998428643582
      name: Cosine F1
    - type: cosine_f1_threshold
      value: 0.7967153191566467
      name: Cosine F1 Threshold
    - type: cosine_precision
      value: 0.9808145405587344
      name: Cosine Precision
    - type: cosine_recall
      value: 0.9815854480125757
      name: Cosine Recall
    - type: cosine_ap
      value: 0.9982741477166501
      name: Cosine Ap
    - type: cosine_mcc
      value: 0.9623852063191376
      name: Cosine Mcc
---

# SentenceTransformer based on sentence-transformers/all-MiniLM-L6-v2

This is a [sentence-transformers](https://www.SBERT.net) model finetuned from [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) on the ranking and verification datasets. It maps sentences & paragraphs to a 384-dimensional dense vector space and can be used for semantic textual similarity, semantic search, paraphrase mining, classification, clustering, and more.

## Model Details

### Model Description
- **Model Type:** Sentence Transformer
- **Base model:** [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) <!-- at revision 1110a243fdf4706b3f48f1d95db1a4f5529b4d41 -->
- **Maximum Sequence Length:** 256 tokens
- **Output Dimensionality:** 384 dimensions
- **Similarity Function:** Cosine Similarity
- **Supported Modality:** Text
- **Training Datasets:**
    - ranking
    - verification
<!-- - **Language:** Unknown -->
<!-- - **License:** Unknown -->

### Model Sources

- **Documentation:** [Sentence Transformers Documentation](https://sbert.net)
- **Repository:** [Sentence Transformers on GitHub](https://github.com/huggingface/sentence-transformers)
- **Hugging Face:** [Sentence Transformers on Hugging Face](https://huggingface.co/models?library=sentence-transformers)

### Full Model Architecture

```
SentenceTransformer(
  (0): Transformer({'transformer_task': 'feature-extraction', 'modality_config': {'text': {'method': 'forward', 'method_output_name': 'last_hidden_state'}}, 'module_output_name': 'token_embeddings', 'architecture': 'BertModel'})
  (1): Pooling({'embedding_dimension': 384, 'pooling_mode': 'mean', 'include_prompt': True})
  (2): Normalize({})
)
```

## Usage

### Direct Usage (Sentence Transformers)

First install the Sentence Transformers library:

```bash
pip install -U sentence-transformers
```
Then you can load this model and run inference.
```python
from sentence_transformers import SentenceTransformer

# Download from the 🤗 Hub
model = SentenceTransformer("sentence_transformers_model_id")
# Run inference
sentences = [
    "affordable teal's epsom salt body scrub exfoliate renew with eucalyptus spearmint dr",
    "dr teal's epsom salt body scrub exfoliate renew with eucalyptus spearmint",
    "dr teal's with skin lotion cream essence eye cream primehub korea stocks",
]
embeddings = model.encode(sentences)
print(embeddings.shape)
# [3, 384]

# Get the similarity scores for the embeddings
similarities = model.similarity(embeddings, embeddings)
print(similarities)
# tensor([[1.0000, 0.9873, 0.0389],
#         [0.9873, 1.0000, 0.0359],
#         [0.0389, 0.0359, 1.0000]])
```
<!--
### Direct Usage (Transformers)

<details><summary>Click to see the direct usage in Transformers</summary>

</details>
-->

<!--
### Downstream Usage (Sentence Transformers)

You can finetune this model on your own dataset.

<details><summary>Click to expand</summary>

</details>
-->

<!--
### Out-of-Scope Use

*List how the model may foreseeably be misused and address what users ought not to do with the model.*
-->

## Evaluation

### Metrics

#### Binary Classification

* Dataset: `val_verify`
* Evaluated with [<code>BinaryClassificationEvaluator</code>](https://sbert.net/docs/package_reference/sentence_transformer/evaluation.html#sentence_transformers.sentence_transformer.evaluation.BinaryClassificationEvaluator)

| Metric                    | Value      |
|:--------------------------|:-----------|
| cosine_accuracy           | 0.9812     |
| cosine_accuracy_threshold | 0.7967     |
| cosine_f1                 | 0.9812     |
| cosine_f1_threshold       | 0.7967     |
| cosine_precision          | 0.9808     |
| cosine_recall             | 0.9816     |
| **cosine_ap**             | **0.9983** |
| cosine_mcc                | 0.9624     |

<!--
## Bias, Risks and Limitations

*What are the known or foreseeable issues stemming from this model? You could also flag here known failure cases or weaknesses of the model.*
-->

<!--
### Recommendations

*What are recommendations with respect to the foreseeable issues? For example, filtering explicit content.*
-->

## Training Details

### Training Datasets

#### ranking

* Dataset: ranking
* Size: 148,027 training samples
* Columns: <code>anchor</code>, <code>positive</code>, and <code>negative</code>
* Approximate statistics based on the first 100 samples:
  |          | anchor                                                                           | positive                                                                          | negative                                                                         |
  |:---------|:---------------------------------------------------------------------------------|:----------------------------------------------------------------------------------|:---------------------------------------------------------------------------------|
  | type     | string                                                                           | string                                                                            | string                                                                           |
  | modality | text                                                                             | text                                                                              | text                                                                             |
  | details  | <ul><li>min: 7 tokens</li><li>mean: 17.0 tokens</li><li>max: 31 tokens</li></ul> | <ul><li>min: 4 tokens</li><li>mean: 12.77 tokens</li><li>max: 27 tokens</li></ul> | <ul><li>min: 4 tokens</li><li>mean: 14.0 tokens</li><li>max: 33 tokens</li></ul> |
* Samples:
  | anchor                                                                     | positive                                | negative                                 |
  |:---------------------------------------------------------------------------|:----------------------------------------|:-----------------------------------------|
  | <code>new noorani golden brown</code>                                      | <code>noorani golden brown</code>       | <code>everyone golden brown</code>       |
  | <code>bestseller golden brown noorani henna personal care essential</code> | <code>noorani golden brown henna</code> | <code>mediheal golden brown henna</code> |
  | <code>noorani golden brown henna</code>                                    | <code>noorani golden brown henna</code> | <code>noorani chestnut henna</code>      |
* Loss: [<code>MultipleNegativesRankingLoss</code>](https://sbert.net/docs/package_reference/sentence_transformer/losses.html#multiplenegativesrankingloss) with these parameters:
  ```json
  {
      "scale": 20.0,
      "similarity_fct": "cos_sim",
      "gather_across_devices": false,
      "directions": [
          "query_to_doc"
      ],
      "partition_mode": "joint",
      "hardness_mode": null,
      "hardness_strength": 0.0
  }
  ```

#### verification

* Dataset: verification
* Size: 178,110 training samples
* Columns: <code>sentence1</code>, <code>sentence2</code>, and <code>label</code>
* Approximate statistics based on the first 100 samples:
  |          | sentence1                                                                         | sentence2                                                                         | label                                           |
  |:---------|:----------------------------------------------------------------------------------|:----------------------------------------------------------------------------------|:------------------------------------------------|
  | type     | string                                                                            | string                                                                            | int                                             |
  | modality | text                                                                              | text                                                                              |                                                 |
  | details  | <ul><li>min: 5 tokens</li><li>mean: 15.69 tokens</li><li>max: 44 tokens</li></ul> | <ul><li>min: 5 tokens</li><li>mean: 13.81 tokens</li><li>max: 28 tokens</li></ul> | <ul><li>0: ~52.88%</li><li>1: ~47.12%</li></ul> |
* Samples:
  | sentence1                                                                                                  | sentence2                                                                   | label          |
  |:-----------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------|:---------------|
  | <code>clarins precious la lotion</code>                                                                    | <code>clarins precious la creme</code>                                      | <code>0</code> |
  | <code>haircraze permanent hair color light brown must have topmart</code>                                  | <code>d'sign professional italy permanent hair color light brown new</code> | <code>0</code> |
  | <code>primestore rhalls cosmetics frost glow with personal care essential easy to use product promo</code> | <code>rhalls cosmetics frost glow</code>                                    | <code>1</code> |
* Loss: [<code>ContrastiveLoss</code>](https://sbert.net/docs/package_reference/sentence_transformer/losses.html#contrastiveloss) with these parameters:
  ```json
  {
      "distance_metric": "SiameseDistanceMetric.COSINE_DISTANCE",
      "margin": 0.65,
      "size_average": true
  }
  ```

### Training Hyperparameters
#### Non-Default Hyperparameters

- `per_device_train_batch_size`: 128
- `num_train_epochs`: 2
- `learning_rate`: 2e-05
- `warmup_steps`: 0.1
- `weight_decay`: 0.01
- `fp16`: True
- `per_device_eval_batch_size`: 256
- `load_best_model_at_end`: True
- `batch_sampler`: no_duplicates

#### All Hyperparameters
<details><summary>Click to expand</summary>

- `per_device_train_batch_size`: 128
- `num_train_epochs`: 2
- `max_steps`: -1
- `learning_rate`: 2e-05
- `lr_scheduler_type`: linear
- `lr_scheduler_kwargs`: None
- `warmup_steps`: 0.1
- `optim`: adamw_torch_fused
- `optim_args`: None
- `weight_decay`: 0.01
- `adam_beta1`: 0.9
- `adam_beta2`: 0.999
- `adam_epsilon`: 1e-08
- `optim_target_modules`: None
- `gradient_accumulation_steps`: 1
- `average_tokens_across_devices`: True
- `max_grad_norm`: 1.0
- `label_smoothing_factor`: 0.0
- `bf16`: False
- `fp16`: True
- `bf16_full_eval`: False
- `fp16_full_eval`: False
- `tf32`: None
- `gradient_checkpointing`: False
- `gradient_checkpointing_kwargs`: None
- `torch_compile`: False
- `torch_compile_backend`: None
- `torch_compile_mode`: None
- `use_liger_kernel`: False
- `liger_kernel_config`: None
- `use_cache`: False
- `neftune_noise_alpha`: None
- `torch_empty_cache_steps`: None
- `auto_find_batch_size`: False
- `log_on_each_node`: True
- `logging_nan_inf_filter`: True
- `include_num_input_tokens_seen`: no
- `log_level`: passive
- `log_level_replica`: warning
- `disable_tqdm`: False
- `project`: huggingface
- `trackio_space_id`: None
- `trackio_bucket_id`: None
- `trackio_static_space_id`: None
- `per_device_eval_batch_size`: 256
- `prediction_loss_only`: True
- `eval_on_start`: False
- `eval_do_concat_batches`: True
- `eval_use_gather_object`: False
- `eval_accumulation_steps`: None
- `include_for_metrics`: []
- `batch_eval_metrics`: False
- `save_only_model`: False
- `save_on_each_node`: False
- `enable_jit_checkpoint`: False
- `push_to_hub`: False
- `hub_private_repo`: None
- `hub_model_id`: None
- `hub_strategy`: every_save
- `hub_always_push`: False
- `hub_revision`: None
- `load_best_model_at_end`: True
- `ignore_data_skip`: False
- `restore_callback_states_from_checkpoint`: False
- `full_determinism`: False
- `seed`: 42
- `data_seed`: None
- `use_cpu`: False
- `accelerator_config`: {'split_batches': False, 'dispatch_batches': None, 'even_batches': True, 'use_seedable_sampler': True, 'non_blocking': False, 'gradient_accumulation_kwargs': None}
- `parallelism_config`: None
- `dataloader_drop_last`: False
- `dataloader_num_workers`: 0
- `dataloader_pin_memory`: True
- `dataloader_persistent_workers`: False
- `dataloader_prefetch_factor`: None
- `dataloader_multiprocessing_context`: None
- `dataloader_in_order`: True
- `remove_unused_columns`: True
- `label_names`: None
- `train_sampling_strategy`: random
- `length_column_name`: length
- `ddp_find_unused_parameters`: None
- `ddp_bucket_cap_mb`: None
- `ddp_broadcast_buffers`: False
- `ddp_static_graph`: None
- `ddp_backend`: None
- `ddp_timeout`: 1800
- `fsdp`: None
- `fsdp_config`: None
- `deepspeed`: None
- `debug`: []
- `skip_memory_metrics`: True
- `do_predict`: False
- `resume_from_checkpoint`: None
- `local_rank`: -1
- `prompts`: None
- `batch_sampler`: no_duplicates
- `multi_dataset_batch_sampler`: proportional
- `router_mapping`: {}
- `learning_rate_mapping`: {}
- `warmup_ratio`: None

</details>

### Training Logs
| Epoch      | Step     | Training Loss | val_verify_cosine_ap |
|:----------:|:--------:|:-------------:|:--------------------:|
| 0.0784     | 100      | 0.0620        | -                    |
| 0.1569     | 200      | 0.0276        | -                    |
| 0.1961     | 250      | -             | 0.9913               |
| 0.2353     | 300      | 0.0217        | -                    |
| 0.3137     | 400      | 0.0184        | -                    |
| 0.3922     | 500      | 0.0172        | 0.9966               |
| 0.4706     | 600      | 0.0162        | -                    |
| 0.5490     | 700      | 0.0155        | -                    |
| 0.5882     | 750      | -             | 0.9973               |
| 0.6275     | 800      | 0.0155        | -                    |
| 0.7059     | 900      | 0.0153        | -                    |
| 0.7843     | 1000     | 0.0155        | 0.9978               |
| 0.8627     | 1100     | 0.0141        | -                    |
| 0.9412     | 1200     | 0.0147        | -                    |
| 0.9804     | 1250     | -             | 0.9981               |
| 1.0196     | 1300     | 0.0141        | -                    |
| 1.0980     | 1400     | 0.0138        | -                    |
| 1.1765     | 1500     | 0.0128        | 0.9983               |
| 1.2549     | 1600     | 0.0126        | -                    |
| 1.3333     | 1700     | 0.0126        | -                    |
| **1.3725** | **1750** | **-**         | **0.9984**           |
| 1.4118     | 1800     | 0.0123        | -                    |
| 1.4902     | 1900     | 0.0121        | -                    |
| 1.5686     | 2000     | 0.0123        | 0.9982               |
| 1.6471     | 2100     | 0.0118        | -                    |
| 1.7255     | 2200     | 0.0127        | -                    |
| 1.7647     | 2250     | -             | 0.9982               |
| 1.8039     | 2300     | 0.0125        | -                    |
| 1.8824     | 2400     | 0.0121        | -                    |
| 1.9608     | 2500     | 0.0121        | 0.9983               |
| 2.0        | 2550     | -             | 0.9983               |

* The bold row denotes the saved checkpoint.

### Training Time
- **Training**: 18.2 minutes

### Framework Versions
- Python: 3.13.15
- Sentence Transformers: 5.7.0
- Transformers: 5.16.1
- PyTorch: 2.11.0+cu128
- Accelerate: 1.14.0
- Datasets: 4.8.5
- Tokenizers: 0.23.1

## Additional Resources

- [Training and Finetuning Embedding Models with Sentence Transformers](https://huggingface.co/blog/train-sentence-transformers): the end-to-end guide for training or finetuning Sentence Transformer models.
- [Introduction to Matryoshka Embedding Models](https://huggingface.co/blog/matryoshka): variable-size embeddings that can be truncated with minimal quality loss.
- [Binary and Scalar Embedding Quantization for Significantly Faster & Cheaper Retrieval](https://huggingface.co/blog/embedding-quantization): post-training compression of embedding vectors.
- [Multimodal Embedding & Reranker Models with Sentence Transformers](https://huggingface.co/blog/multimodal-sentence-transformers): use text, image, audio, and video models through the same API.
- [Training and Finetuning Multimodal Embedding & Reranker Models with Sentence Transformers](https://huggingface.co/blog/train-multimodal-sentence-transformers): train multimodal embedding models, with a Visual Document Retrieval walkthrough.

## Citation

### BibTeX

#### Sentence Transformers
```bibtex
@inproceedings{reimers-2019-sentence-bert,
    title = "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks",
    author = "Reimers, Nils and Gurevych, Iryna",
    booktitle = "Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing",
    month = "11",
    year = "2019",
    publisher = "Association for Computational Linguistics",
    url = "https://arxiv.org/abs/1908.10084",
}
```

#### MultipleNegativesRankingLoss
```bibtex
@misc{oord2019representationlearningcontrastivepredictive,
      title={Representation Learning with Contrastive Predictive Coding},
      author={Aaron van den Oord and Yazhe Li and Oriol Vinyals},
      year={2019},
      eprint={1807.03748},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/1807.03748},
}
```

#### ContrastiveLoss
```bibtex
@inproceedings{hadsell2006dimensionality,
    author={Hadsell, R. and Chopra, S. and LeCun, Y.},
    booktitle={2006 IEEE Computer Society Conference on Computer Vision and Pattern Recognition (CVPR'06)},
    title={Dimensionality Reduction by Learning an Invariant Mapping},
    year={2006},
    volume={2},
    number={},
    pages={1735-1742},
    doi={10.1109/CVPR.2006.100}
}
```

<!--
## Glossary

*Clearly define terms in order to be accessible across audiences.*
-->

<!--
## Model Card Authors

*Lists the people who create the model card, providing recognition and accountability for the detailed work that goes into its construction.*
-->

<!--
## Model Card Contact

*Provides a way for people who have updates to the Model Card, suggestions, or questions, to contact the Model Card authors.*
-->